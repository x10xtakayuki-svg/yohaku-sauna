#include "SaunaEngine.hpp"
#include <algorithm>
#include <cmath>

namespace yohaku {
namespace {
constexpr double pi=3.14159265358979323846;
double clamp(double x,double lo,double hi){return std::clamp(x,lo,hi);}
double ease(double x){x=clamp(x,0,1);return x*x*(3-2*x);}
double mix(double a,double b,double t){return a+(b-a)*t;}
}
double SaunaEngine::Filter::run(double x) noexcept {
    const double y=b0*x+z1;z1=b1*x-a1*y+z2;z2=b2*x-a2*y;return y;
}
void SaunaEngine::Filter::set(double f,double q,double sr,bool band) noexcept {
    const double w=2*pi*clamp(f,10,sr*.45)/sr,cs=std::cos(w),sn=std::sin(w),alpha=sn/(2*q),a0=1+alpha;
    b0=(band?alpha:(1-cs)*.5)/a0;b1=band?0:(1-cs)/a0;b2=band?-alpha/a0:b0;
    a1=-2*cs/a0;a2=(1-alpha)/a0;
}
double SaunaEngine::random() noexcept {random_=random_*1664525u+1013904223u;return double(random_)/4294967296.0;}
double SaunaEngine::drift(double t) noexcept {
    return (std::sin(t*pi/80+.4)+std::sqrt(.5)*std::sin(t*pi/40+1.7)+.5*std::sin(t*pi/20+3.1)+std::sqrt(.125)*std::sin(t*pi/10+.8))/(1+std::sqrt(.5)+.5+std::sqrt(.125));
}
SaunaEngine::SaunaEngine(double sr):sampleRate_(clamp(sr,8000,96000)) {
    noise_.resize(static_cast<size_t>(sampleRate_*7));double brown=0;
    for(auto& n:noise_){const double white=random()*2-1;brown=(brown+.025*white)/1.025;n=float(white*.62+brown*2);}
    echoL_.resize(static_cast<size_t>(sampleRate_*.092));echoR_.resize(static_cast<size_t>(sampleRate_*.143));
    ambient_.set(180,.707,sampleRate_);for(int i=0;i<6;i++)voices_[i].filter.set(650+i*320,.45,sampleRate_,true);
    for(auto& f:output_)f.set(3920,.707,sampleRate_);
    resetStones();publish();
}
void SaunaEngine::resetStones() noexcept {
    // Same seeded coordinates and thermal constants as the browser's stones.
    const auto old=random_;random_=8127;int index=0;const double spread[]={45,55,58,51};
    for(int row=0;row<4;row++)for(int col=0;col<6;col++){
        Stone s;s.x=752+(col-2.5)*spread[row]*.86+(random()-.5)*20;s.y=325+row*35+(random()-.5)*28;
        random();s.surface=295+random()*45;s.core=340+random()*35;s.rough=.7+random()*.6;s.capacity=65+random()*45;stones_[index++]=s;
    }
    std::sort(stones_.begin(),stones_.end(),[](const Stone& a,const Stone& b){return a.y<b.y;});random_=old;
}
bool SaunaEngine::enqueue(Command command) noexcept {
    if(!std::isfinite(command.a)||!std::isfinite(command.b)||!std::isfinite(command.c))return false;
    const unsigned w=write_.load(std::memory_order_relaxed),next=(w+1)%queueSize;
    if(next==read_.load(std::memory_order_acquire))return false;
    commands_[w]=command;write_.store(next,std::memory_order_release);return true;
}
void SaunaEngine::resetAuto() noexcept {autoTime_=0;nextDrop_=4.5;stage_=0;stageTime_=0;wait_=6;quietFor_=0;turn_=0;startedAt_=0;}
void SaunaEngine::apply(Command c) noexcept {
    switch(c.action){
    case Action::Start:
        mode_=c.a>=.5;pattern_=int(clamp(c.b,0,2));started_=playing_=true;pouring_=false;phase_=1;
        audible_=elapsed_=tail_=ladle_=stream_=gain_=currentGain_=0;resetAuto();resetStones();
        for(auto& v:voices_)v.level=v.target=v.renderLevel=0;
        for(auto& b:bursts_)b.age=-1;
        std::fill(echoL_.begin(),echoL_.end(),0);std::fill(echoR_.begin(),echoR_.end(),0);break;
    case Action::Playing:if(started_&&phase_!=3){playing_=c.a>=.5;pouring_=false;}break;
    case Action::Mode:if(phase_==1){mode_=c.a>=.5;pouring_=false;resetAuto();}break;
    case Action::Pattern:pattern_=int(clamp(c.a,0,2));resetAuto();break;
    case Action::Settings:volume_=clamp(c.a,0,100)/100;distance_=clamp(c.b,0,100)/100;flow_=clamp(c.c,10,100);break;
    case Action::Duration:duration_=(c.a==5||c.a==10||c.a==20)?c.a:0;elapsed_=0;if(phase_==2){phase_=1;tail_=0;}break;
    case Action::Fill:if(playing_&&phase_==1&&mode_==0){ladle_=160;burst(0,1,390);}break;
    case Action::Pour:if(playing_&&phase_==1&&mode_==0&&ladle_>0){pouring_=true;pourX_=clamp(c.a,565,930);pourY_=clamp(c.b,330,470);}break;
    case Action::StopPour:pouring_=false;break;
    case Action::Finish:if(started_&&phase_!=3){pouring_=false;stream_=0;if(!playing_){phase_=3;gain_=0;}else if(phase_!=2){phase_=2;tail_=0;}}break;
    case Action::Stop:playing_=started_=pouring_=false;phase_=0;gain_=stream_=0;break;
    }
}
int SaunaEngine::nearest(double x,double y) const noexcept {
    int best=0;double distance=1e12;for(int i=0;i<24;i++){const double d=std::hypot(x-stones_[i].x,y-stones_[i].y);if(d<distance){best=i;distance=d;}}return best;
}
void SaunaEngine::addWater(double x,double y,double amount) noexcept {
    if(amount<=0)return;
    auto& s=stones_[nearest(x,y)];s.water+=amount;s.light=std::min(1.0,s.light+amount*.45);
}
void SaunaEngine::burst(int kind,double amount,double x) noexcept {
    auto& b=bursts_[burstIndex_++%bursts_.size()];b.age=0;b.pan=clamp((x-650)/600,-.5,.5)*(1-distance_*.625);
    const double frequency[]={430,1100,1500};const double duration[]={.55,.10,.055};const double peak[]={.13,.05,.045};
    b.length=duration[kind];b.peak=peak[kind]*clamp(amount,.05,2);b.ping=kind<2;b.phase=0;b.filter={};b.filter.set(frequency[kind]*(.85+random()*.3),kind==1?2.8:.65,sampleRate_,true);
}
void SaunaEngine::step(double dt) noexcept {
    stream_=0;if(!started_||!playing_||phase_==3){publish();return;}
    time_+=dt;audible_+=dt;if(phase_==1){elapsed_+=dt;if(duration_>0&&duration_*60-elapsed_<=20){phase_=2;tail_=0;pouring_=false;}}
    if(phase_==2){tail_+=dt;if(tail_>=20){phase_=3;playing_=false;gain_=0;publish();return;}}
    gain_=ease(audible_/5)*(phase_==2?1-ease((tail_-6)/14):1);
    if(phase_==1&&mode_==0&&pouring_){const double amount=std::min(ladle_,(8+flow_*.52)*dt);ladle_-=amount;stream_=amount/dt;addWater(pourX_,pourY_,amount);if(ladle_<=0)pouring_=false;}
    if(phase_==1&&mode_==1){
        autoTime_+=dt;
        if(pattern_==0&&autoTime_>=nextDrop_){const double x=650+random()*190,y=350+random()*100;addWater(x,y,.55+.15*drift(autoTime_+7));burst(1,.7,x);nextDrop_=autoTime_+14+6*drift(autoTime_*.65+19);}
        if(pattern_!=0){
            const bool wave=pattern_==2;stageTime_+=dt;
            if(stage_==0){
                double evap=0;for(const auto& s:stones_)evap+=s.evap;
                quietFor_=waterLevel_==0&&evap<.000001?quietFor_+dt:0;
                if(quietFor_>=2){stage_=1;stageTime_=0;const double d=drift(turn_*31+13);wait_=turn_==0?6:wave?std::max(28+8*d,60-(autoTime_-startedAt_)):30+8*d;}
            }else{
                if(stage_==1&&stageTime_>=wait_){stage_=2;stageTime_=0;turn_++;startedAt_=autoTime_;}
                if(stage_==2){
                    const double span=(wave?4:10)+(wave?1:2)*drift(turn_*29),progress=stageTime_/span;
                    if(progress>=1){stage_=0;stageTime_=0;quietFor_=0;}else{
                        const double envelope=ease(progress/.25)*(1-ease((progress-.35)/.65));
                        pourX_=wave?746+std::sin(autoTime_*.45)*85:730+std::sin(autoTime_*.12)*70;pourY_=wave?390+std::sin(autoTime_*.3)*20:400;
                        const double hot=stones_[nearest(pourX_,pourY_)].surface>150?1:.3,rate=envelope*(wave?26:2.8)*hot*(.94+.06*drift(autoTime_));
                        addWater(pourX_,pourY_,rate*dt);stream_=wave?rate:rate*2.5;
                    }
                }
            }
        }
    }
    std::array<double,6> energy{};double total=0;
    for(int i=0;i<24;i++){
        auto& s=stones_[i];s.light*=std::exp(-dt/2.8);const double transfer=(s.core-s.surface)*3.8*dt;
        s.surface+=transfer/s.capacity;s.core-=transfer/(s.capacity*7);s.core+=(355-s.core)*.0035*dt;s.surface+=(115-s.surface)*.0015*dt;
        const double potential=std::max(0.0,s.surface-98)*.011*s.rough,available=s.water*(1-std::exp(-dt/(s.rough*.65)));
        const double evaporation=std::min({available,potential*dt,std::max(0.0,(s.surface-95)*s.capacity)/2450});
        s.water-=evaporation;s.surface-=evaporation*2450/s.capacity;s.evap=evaporation/dt;s.wet=mix(s.wet,std::min(1.0,s.water/2+s.evap*.12),std::min(1.0,dt*5));
        if(s.water<1e-12)s.water=0;
        // Water reaches a lower stone, or drains out of the visible heater.
        // Keeping runoff in the bottom row would create a minutes-long puddle.
        if(s.water>4){const double runoff=std::min(s.water-4,12*dt);s.water-=runoff;for(int j=i+1;j<24;j++)if(stones_[j].y>s.y+18&&std::abs(stones_[j].x-s.x)<75){stones_[j].water+=runoff;break;}}
        energy[i%6]+=s.evap;total+=s.evap;
    }
    waterLevel_=0;const bool spacious=mode_==1&&pattern_!=0;
    for(int i=0;i<6;i++){
        auto& v=voices_[i];const double amp=std::min(.22,std::sqrt(energy[i])*.065*(.9+.1*std::sin(time_*.7+i)));
        const double release=3.8+.5*drift(time_*.3+i*19);v.level=spacious?mix(v.level,amp,1-std::exp(-dt/(amp>v.level?.35:release))):amp;
        if(v.level<.00001&&amp<.00001)v.level=0;
        waterLevel_=std::max(waterLevel_,v.level);v.target=v.level;
        const double brightness=spacious?mix(.65,1,clamp(v.level/.1,0,1)):1;v.filter.set((650+i*320)*brightness,.45,sampleRate_,true);
    }
    roomLevel_=.025*((spacious&&stage_==1)?1+.025*drift(time_*.4):1);
    for(auto& f:output_)f.set(mix(5600,2800,distance_),.707,sampleRate_);
    if(total>.005&&random()<std::min(.6,total*dt*1.4))burst(2,std::min(.7,total*.1),stones_[int(random()*24)].x);
    publish();
}
void SaunaEngine::render(float* left,float* right,int frames,int stride) noexcept {
    unsigned r=read_.load(std::memory_order_relaxed);const unsigned w=write_.load(std::memory_order_acquire);
    while(r!=w){apply(commands_[r]);r=(r+1)%queueSize;}read_.store(r,std::memory_order_release);
    const double dt=1/sampleRate_,gainSmoothing=1-std::exp(-dt/.3),voiceSmoothing=1-std::exp(-dt/.2);
    // The audio callback's sample clock advances everything, even with no UI.
    for(int frame=0;frame<frames;frame++){
        stepRemainder_+=dt;if(stepRemainder_>=.05){step(.05);stepRemainder_-=.05;}
        const double target=started_&&playing_&&phase_!=3?volume_*.72*gain_:0;currentGain_+=gainSmoothing*(target-currentGain_);
        const double n=noise_[noiseIndex_],room=ambient_.run(n)*roomLevel_;double l=0,rr=0;
        for(int i=0;i<6;i++){
            auto& v=voices_[i];const unsigned offset=unsigned(sampleRate_*i*.63),index=(noiseIndex_+offset)%noise_.size();
            // Voice smoothing lives in the actual filter signal path, independently of UI polling.
            const double level=playing_?v.target:0;v.renderLevel+=voiceSmoothing*(level-v.renderLevel);
            const double signal=v.filter.run(noise_[index])*v.renderLevel,pan=(i-2.5)*.12;l+=signal*std::sqrt((1-pan)*.5);rr+=signal*std::sqrt((1+pan)*.5);
        }
        for(auto& b:bursts_)if(b.age>=0){
            const double envelope=b.age<.012?b.age/.012:std::exp(-9.2*(b.age-.012)/b.length);
            double signal=b.filter.run(n)*b.peak*envelope;
            if(b.ping&&b.age<.18){b.phase+=2*pi*(410+320*std::exp(-b.age/.06))*dt;signal+=std::sin(b.phase)*.01*std::exp(-b.age/.025);}
            l+=signal*std::sqrt((1-b.pan)*.5);rr+=signal*std::sqrt((1+b.pan)*.5);b.age+=dt;if(b.age>=b.length)b.age=-1;
        }
        const double delayedL=echoL_[echoIndexL_],delayedR=echoR_[echoIndexR_];echoL_[echoIndexL_]=float(l+delayedR*.2);echoR_[echoIndexR_]=float(rr+delayedL*.2);
        if(++echoIndexL_==echoL_.size())echoIndexL_=0;
        if(++echoIndexR_==echoR_.size())echoIndexR_=0;
        const double outL=output_[0].run(room+l+delayedL*.24)*currentGain_,outR=output_[1].run(room+rr+delayedR*.24)*currentGain_;
        left[frame*stride]=float(std::tanh(outL));right[frame*stride]=float(std::tanh(outR));if(++noiseIndex_==noise_.size())noiseIndex_=0;
    }
    publish();
}
void SaunaEngine::publish() noexcept {
    const double values[]={double(started_),double(playing_),double(pouring_),double(mode_),double(pattern_),double(phase_),double(stage_),elapsed_,gain_,ladle_,stream_,pourX_,pourY_,waterLevel_,roomLevel_,tail_,double(turn_),wait_};
    for(int i=0;i<18;i++)view_[i].store(values[i],std::memory_order_relaxed);
    for(int i=0;i<24;i++){const auto& s=stones_[i];const double v[]={s.x,s.y,s.surface,s.core,s.water,s.evap,s.wet,s.light};for(int j=0;j<8;j++)stoneView_[i].values[j].store(v[j],std::memory_order_relaxed);}
}
Snapshot SaunaEngine::snapshot() const noexcept {
    double v[18];for(int i=0;i<18;i++)v[i]=view_[i].load(std::memory_order_relaxed);
    Snapshot s;s.started=v[0];s.playing=v[1];s.pouring=v[2];s.mode=int(v[3]);s.pattern=int(v[4]);s.phase=int(v[5]);s.stage=int(v[6]);s.elapsed=v[7];s.gain=v[8];s.water=v[9];s.stream=v[10];s.pourX=v[11];s.pourY=v[12];s.waterLevel=v[13];s.roomLevel=v[14];s.tailTime=v[15];
    for(int i=0;i<24;i++){double a[8];for(int j=0;j<8;j++)a[j]=stoneView_[i].values[j].load(std::memory_order_relaxed);s.stones[i]={a[0],a[1],a[2],a[3],a[4],a[5],a[6],a[7]};}return s;
}
}
