#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import <AVFAudio/AVFAudio.h>
#import <MediaPlayer/MediaPlayer.h>
#include "../core/SaunaEngine.hpp"
#include <memory>

static NSString * const modes[]={@"manual",@"auto"};
static NSString * const patterns[]={@"drops",@"thread",@"wave"};
static NSString * const phases[]={@"idle",@"free",@"settling",@"finished"};
static NSDictionary *StateJSON(const yohaku::Snapshot& s){
    NSMutableArray *stones=[NSMutableArray arrayWithCapacity:24];
    for(const auto& stone:s.stones)[stones addObject:@{@"x":@(stone.x),@"y":@(stone.y),@"surface":@(stone.surface),@"core":@(stone.core),@"water":@(stone.water),@"evaporation":@(stone.evap),@"wet":@(stone.wet),@"light":@(stone.light)}];
    return @{@"version":@1,@"started":@(s.started),@"playing":@(s.playing),@"pouring":@(s.pouring),@"mode":modes[s.mode],@"pattern":patterns[s.pattern],@"phase":phases[s.phase],@"elapsed":@(s.elapsed),@"gain":@(s.gain),@"water":@(s.water),@"stream":@(s.stream),@"pourX":@(s.pourX),@"pourY":@(s.pourY),@"tailTime":@(s.tailTime),@"waterLevel":@(s.waterLevel),@"roomLevel":@(s.roomLevel),@"stones":stones};
}

@interface YohakuAudio : NSObject {
    std::unique_ptr<yohaku::SaunaEngine> _core;
    AVAudioEngine *_engine;
    AVAudioSourceNode *_source;
    NSTimer *_timer;
    BOOL _requestedPlaying,_resumeAfterInterruption,_starting;
}
@property(nonatomic,copy) void(^onState)(NSDictionary *state);
@property(nonatomic,copy) void(^onError)(NSString *message);
- (void)command:(NSDictionary *)message;
- (void)publish;
@end
@implementation YohakuAudio
- (instancetype)init {
    if((self=[super init])){
        _core=std::make_unique<yohaku::SaunaEngine>(48000);_engine=[AVAudioEngine new];
        AVAudioFormat *format=[[AVAudioFormat alloc] initStandardFormatWithSampleRate:48000 channels:2];
        auto *core=_core.get();
        _source=[[AVAudioSourceNode alloc] initWithFormat:format renderBlock:^OSStatus(BOOL *silent,const AudioTimeStamp *timestamp,AVAudioFrameCount frames,AudioBufferList *output){
            (void)timestamp;*silent=NO;
            if(output->mNumberBuffers>=2)core->render((float *)output->mBuffers[0].mData,(float *)output->mBuffers[1].mData,(int)frames);
            else if(output->mNumberBuffers==1&&output->mBuffers[0].mNumberChannels==2){auto *p=(float *)output->mBuffers[0].mData;core->render(p,p+1,(int)frames,2);}
            else {for(UInt32 i=0;i<output->mNumberBuffers;i++)memset(output->mBuffers[i].mData,0,output->mBuffers[i].mDataByteSize);*silent=YES;}
            return noErr;
        }];
        [_engine attachNode:_source];[_engine connect:_source to:_engine.mainMixerNode format:format];
        __weak YohakuAudio *weak=self;
        _timer=[NSTimer scheduledTimerWithTimeInterval:.15 repeats:YES block:^(NSTimer *timer){(void)timer;[weak publish];}];
        [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(interrupted:) name:AVAudioSessionInterruptionNotification object:nil];
        [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(routeChanged:) name:AVAudioSessionRouteChangeNotification object:nil];
        MPRemoteCommandCenter *remote=MPRemoteCommandCenter.sharedCommandCenter;
        [remote.playCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *event){(void)event;YohakuAudio *strong=weak;if(!strong||!strong->_core->snapshot().started||strong->_core->snapshot().phase==3)return MPRemoteCommandHandlerStatusNoSuchContent;dispatch_async(dispatch_get_main_queue(),^{[strong command:@{@"type":@"playing",@"value":@YES}];});return MPRemoteCommandHandlerStatusSuccess;}];
        [remote.pauseCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *event){(void)event;dispatch_async(dispatch_get_main_queue(),^{[weak command:@{@"type":@"playing",@"value":@NO}];});return MPRemoteCommandHandlerStatusSuccess;}];
        [remote.togglePlayPauseCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *event){(void)event;YohakuAudio *strong=weak;if(!strong)return MPRemoteCommandHandlerStatusCommandFailed;BOOL play=!strong->_requestedPlaying;dispatch_async(dispatch_get_main_queue(),^{[strong command:@{@"type":@"playing",@"value":@(play)}];});return MPRemoteCommandHandlerStatusSuccess;}];
    }return self;
}
- (BOOL)activate {
    NSError *error=nil;AVAudioSession *session=AVAudioSession.sharedInstance;
    [session setCategory:AVAudioSessionCategoryPlayback mode:AVAudioSessionModeDefault options:0 error:&error];
    if(!error)[session setActive:YES error:&error];
    if(!error&&!_engine.running)[_engine startAndReturnError:&error];
    if(error){_requestedPlaying=NO;if(self.onError)self.onError(@"音を再生できませんでした。もう一度お試しください。");return NO;}return YES;
}
- (void)suspendWhenQuiet {
    __weak YohakuAudio *weak=self;dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(.6*NSEC_PER_SEC)),dispatch_get_main_queue(),^{
        YohakuAudio *strong=weak;if(!strong||strong->_requestedPlaying)return;[strong->_engine pause];[AVAudioSession.sharedInstance setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];
    });
}
- (void)command:(NSDictionary *)m {
    NSString *type=m[@"type"];if(![type isKindOfClass:NSString.class])return;
    auto send=[&](yohaku::Command c){if(!_core->enqueue(c)&&self.onError)self.onError(@"操作が混み合っています。少し待ってお試しください。");};
    if([type isEqual:@"prepare"])return;
    if([type isEqual:@"start"]){_starting=YES;if(![self activate]){_starting=NO;return;}_requestedPlaying=YES;send({yohaku::Action::Start,[m[@"mode"] isEqual:@"auto"]?1.:0.,[m[@"pattern"] isEqual:@"thread"]?1.:[m[@"pattern"] isEqual:@"wave"]?2.:0.});}
    else if([type isEqual:@"playing"]){BOOL play=[m[@"value"] boolValue];if(play&&![self activate])return;_requestedPlaying=play;send({yohaku::Action::Playing,double(play)});if(!play)[self suspendWhenQuiet];}
    else if([type isEqual:@"settings"])send({yohaku::Action::Settings,[m[@"volume"] doubleValue],[m[@"distance"] doubleValue],[m[@"flow"] doubleValue]});
    else if([type isEqual:@"duration"])send({yohaku::Action::Duration,[m[@"value"] doubleValue]});
    else if([type isEqual:@"mode"])send({yohaku::Action::Mode,[m[@"value"] isEqual:@"auto"]?1.:0.});
    else if([type isEqual:@"pattern"])send({yohaku::Action::Pattern,[m[@"value"] isEqual:@"thread"]?1.:[m[@"value"] isEqual:@"wave"]?2.:0.});
    else if([type isEqual:@"fill"])send({yohaku::Action::Fill});
    else if([type isEqual:@"pour"])send({yohaku::Action::Pour,[m[@"x"] doubleValue],[m[@"y"] doubleValue]});
    else if([type isEqual:@"stopPour"])send({yohaku::Action::StopPour});
    else if([type isEqual:@"finish"]){if(!_engine.running)[self activate];send({yohaku::Action::Finish});}
    else if([type isEqual:@"stop"]){if(!_engine.running)[self activate];send({yohaku::Action::Stop});_requestedPlaying=NO;[self suspendWhenQuiet];}
}
- (void)publish {
    auto state=_core->snapshot();if(state.phase==1)_starting=NO;if(state.phase==3&&_requestedPlaying&&!_starting){_requestedPlaying=NO;[self suspendWhenQuiet];}
    if(state.started){
        MPNowPlayingInfoCenter.defaultCenter.nowPlayingInfo=@{MPMediaItemPropertyTitle:@"余白 — おうちのサウナ",MPMediaItemPropertyArtist:state.mode?@"静かなオートロウリュ":@"セルフロウリュ",MPNowPlayingInfoPropertyElapsedPlaybackTime:@(state.elapsed),MPNowPlayingInfoPropertyPlaybackRate:@(state.playing&&_requestedPlaying?1:0),MPNowPlayingInfoPropertyIsLiveStream:@YES};
    }else MPNowPlayingInfoCenter.defaultCenter.nowPlayingInfo=nil;
    if(self.onState){NSMutableDictionary *json=[StateJSON(state) mutableCopy];json[@"playing"]=@(state.playing&&_requestedPlaying);self.onState(json);}
}
- (void)interrupted:(NSNotification *)n {
    if([n.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue]==AVAudioSessionInterruptionTypeBegan){_resumeAfterInterruption=_requestedPlaying;[self command:@{@"type":@"playing",@"value":@NO}];}
    else if(_resumeAfterInterruption&&([n.userInfo[AVAudioSessionInterruptionOptionKey] unsignedIntegerValue]&AVAudioSessionInterruptionOptionShouldResume)){_resumeAfterInterruption=NO;[self command:@{@"type":@"playing",@"value":@YES}];}
}
- (void)routeChanged:(NSNotification *)n {if([n.userInfo[AVAudioSessionRouteChangeReasonKey] unsignedIntegerValue]==AVAudioSessionRouteChangeReasonOldDeviceUnavailable)[self command:@{@"type":@"playing",@"value":@NO}];}
- (void)dealloc {[_timer invalidate];[_engine stop];[[NSNotificationCenter defaultCenter] removeObserver:self];}
@end

@interface YohakuController : UIViewController<WKScriptMessageHandler,WKNavigationDelegate>
@property(nonatomic,strong) WKWebView *web;
@property(nonatomic,strong) YohakuAudio *audio;
@property(nonatomic,strong) NSURL *webRoot;
@end
@implementation YohakuController
- (void)viewDidLoad {
    [super viewDidLoad];self.view.backgroundColor=[UIColor colorWithRed:.078 green:.106 blue:.094 alpha:1];self.audio=[YohakuAudio new];
    WKWebViewConfiguration *config=[WKWebViewConfiguration new];[config.userContentController addScriptMessageHandler:self name:@"yohaku"];
    self.web=[[WKWebView alloc] initWithFrame:self.view.bounds configuration:config];self.web.autoresizingMask=UIViewAutoresizingFlexibleWidth|UIViewAutoresizingFlexibleHeight;self.web.navigationDelegate=self;self.web.opaque=NO;self.web.backgroundColor=self.view.backgroundColor;
    [self.view addSubview:self.web];self.webRoot=[NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"Web" isDirectory:YES];
    __weak YohakuController *weak=self;
    self.audio.onState=^(NSDictionary *state){if(UIApplication.sharedApplication.applicationState==UIApplicationStateActive)[weak emit:@"yohaku-native-state" data:state];};
    self.audio.onError=^(NSString *message){[weak emit:@"yohaku-native-error" data:@{@"message":message}];};
    [self.web loadFileURL:[self.webRoot URLByAppendingPathComponent:@"index.html"] allowingReadAccessToURL:self.webRoot];
}
- (void)viewSafeAreaInsetsDidChange {[super viewSafeAreaInsetsDidChange];self.web.frame=self.view.safeAreaLayoutGuide.layoutFrame;}
- (void)emit:(NSString *)event data:(NSDictionary *)data {
    NSData *json=[NSJSONSerialization dataWithJSONObject:data options:0 error:nil];NSString *payload=[[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
    [self.web evaluateJavaScript:[NSString stringWithFormat:@"window.dispatchEvent(new CustomEvent('%@',{detail:%@}));",event,payload] completionHandler:nil];
}
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
    (void)controller;if(!message.frameInfo.isMainFrame||![message.body isKindOfClass:NSDictionary.class])return;
    if(!self.web.URL.isFileURL||![self.web.URL.path hasPrefix:[self.webRoot.path stringByAppendingString:@"/"]])return;
    [self.audio command:message.body];
}
- (void)webView:(WKWebView *)web decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void(^)(WKNavigationActionPolicy))handler {
    (void)web;NSURL *url=action.request.URL;handler(url.isFileURL&&[url.path hasPrefix:[self.webRoot.path stringByAppendingString:@"/"]]?WKNavigationActionPolicyAllow:WKNavigationActionPolicyCancel);
}
- (void)webView:(WKWebView *)web didFinishNavigation:(WKNavigation *)navigation {(void)web;(void)navigation;[self.audio publish];}
@end

@interface YohakuApp : UIResponder<UIApplicationDelegate>
@property(nonatomic,strong) UIWindow *window;
@end
@implementation YohakuApp
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
    (void)application;(void)options;self.window=[[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];self.window.rootViewController=[YohakuController new];[self.window makeKeyAndVisible];return YES;
}
@end
int main(int argc,char *argv[]){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(YohakuApp.class));}}
