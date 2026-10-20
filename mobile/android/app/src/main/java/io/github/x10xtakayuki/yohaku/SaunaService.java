package io.github.x10xtakayuki.yohaku;

import android.app.*;
import android.content.*;
import android.media.*;
import android.media.session.*;
import android.os.*;
import org.json.*;

public final class SaunaService extends Service {
    private static final String CHANNEL="yohaku-audio";
    private static final int NOTIFICATION=17;
    public final class LocalBinder extends Binder { SaunaService service(){return SaunaService.this;} }
    private final IBinder binder=new LocalBinder();
    private final Object signal=new Object();
    private final Handler main=new Handler(Looper.getMainLooper());
    private volatile boolean running=true,requestedPlaying=false;
    private volatile String lastSnapshot="{}",lastError=null;
    private long handle;
    private AudioTrack track;
    private Thread audioThread;
    private AudioManager manager;
    private AudioFocusRequest focus;
    private MediaSession session;
    private boolean finishing=false;

    private void error(String message){lastError=message;requestedPlaying=false;}
    public String takeError(){String error=lastError;lastError=null;return error;}
    public String snapshot(){return lastSnapshot;}
    private void send(int action,double a,double b,double c){if(handle!=0&&!NativeAudio.command(handle,action,a,b,c))error("操作が混み合っています。少し待ってお試しください。");synchronized(signal){signal.notifyAll();}}
    private void play(boolean value){
        if(value){
            if(manager.requestAudioFocus(focus)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED){error("ほかの音声が使用中です。もう一度お試しください。");return;}
            startForeground(NOTIFICATION,notification());
        }
        requestedPlaying=value;send(1,value?1:0,0,0);updateSession();
    }
    public void command(JSONObject m){
        String type=m.optString("type");
        switch(type){
            case "prepare":break;
            case "start":
                if(manager.requestAudioFocus(focus)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED){error("ほかの音声が使用中です。もう一度お試しください。");return;}
                finishing=false;requestedPlaying=true;startForeground(NOTIFICATION,notification());send(0,"auto".equals(m.optString("mode"))?1:0,pattern(m.optString("pattern")),0);break;
            case "playing":play(m.optBoolean("value"));break;
            case "mode":send(2,"auto".equals(m.optString("value"))?1:0,0,0);break;
            case "pattern":send(3,pattern(m.optString("value")),0,0);break;
            case "settings":send(4,m.optDouble("volume",45),m.optDouble("distance",60),m.optDouble("flow",35));break;
            case "duration":send(5,m.optDouble("value",0),0,0);break;
            case "fill":send(6,0,0,0);break;
            case "pour":send(7,m.optDouble("x",745),m.optDouble("y",405),0);break;
            case "stopPour":send(8,0,0,0);break;
            case "finish":send(9,0,0,0);break;
            case "stop":requestedPlaying=false;send(10,0,0,0);manager.abandonAudioFocusRequest(focus);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();break;
        }
    }
    private static int pattern(String name){return "thread".equals(name)?1:"wave".equals(name)?2:0;}
    private Notification notification(){
        Intent intent=new Intent(this,MainActivity.class);
        PendingIntent open=PendingIntent.getActivity(this,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this,CHANNEL).setContentTitle("余白 — おうちのサウナ").setContentText(requestedPlaying?"静かなロウリュ":"ひと休み中")
            .setSmallIcon(android.R.drawable.ic_media_play).setContentIntent(open).setOnlyAlertOnce(true).setOngoing(requestedPlaying)
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken())).setVisibility(Notification.VISIBILITY_PUBLIC).build();
    }
    private void updateSession(){
        session.setPlaybackState(new PlaybackState.Builder().setActions(PlaybackState.ACTION_PLAY|PlaybackState.ACTION_PAUSE|PlaybackState.ACTION_PLAY_PAUSE|PlaybackState.ACTION_STOP).setState(requestedPlaying?PlaybackState.STATE_PLAYING:PlaybackState.STATE_PAUSED,PlaybackState.PLAYBACK_POSITION_UNKNOWN,requestedPlaying?1:0).build());
        session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE,"余白 — おうちのサウナ").putString(MediaMetadata.METADATA_KEY_ARTIST,"静かなロウリュ").build());
        getSystemService(NotificationManager.class).notify(NOTIFICATION,notification());
    }
    @Override public void onCreate(){
        super.onCreate();NotificationManager notifications=getSystemService(NotificationManager.class);notifications.createNotificationChannel(new NotificationChannel(CHANNEL,"ロウリュの再生",NotificationManager.IMPORTANCE_LOW));
        session=new MediaSession(this,"Yohaku");session.setCallback(new MediaSession.Callback(){
            @Override public void onPlay(){play(true);}
            @Override public void onPause(){play(false);}
            @Override public void onStop(){JSONObject stop=new JSONObject();try{stop.put("type","stop");}catch(JSONException ignored){}command(stop);}
        });session.setActive(true);startForeground(NOTIFICATION,notification());
        manager=getSystemService(AudioManager.class);
        AudioAttributes attributes=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
        focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes).setOnAudioFocusChangeListener(change->{if(change<0)play(false);}).build();
        handle=NativeAudio.create();if(handle==0){error("音の準備ができませんでした。");stopSelf();return;}
        int min=AudioTrack.getMinBufferSize(48000,AudioFormat.CHANNEL_OUT_STEREO,AudioFormat.ENCODING_PCM_FLOAT);
        track=new AudioTrack.Builder().setAudioAttributes(attributes).setAudioFormat(new AudioFormat.Builder().setSampleRate(48000).setChannelMask(AudioFormat.CHANNEL_OUT_STEREO).setEncoding(AudioFormat.ENCODING_PCM_FLOAT).build()).setBufferSizeInBytes(Math.max(min,480*2*4*4)).setTransferMode(AudioTrack.MODE_STREAM).build();
        audioThread=new Thread(()->{
            Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO);float[] output=new float[960];int batch=0;
            while(running){
                if(requestedPlaying){
                    if(track.getPlayState()!=AudioTrack.PLAYSTATE_PLAYING)track.play();
                    NativeAudio.render(handle,output);
                    int offset=0;while(running&&offset<output.length){int written=track.write(output,offset,output.length-offset,AudioTrack.WRITE_BLOCKING);if(written<=0){error("音の再生が中断されました。");break;}offset+=written;}
                }else{
                    if(track.getPlayState()==AudioTrack.PLAYSTATE_PLAYING){track.pause();track.flush();}
                    // Consume control messages while paused, without advancing session time.
                    NativeAudio.render(handle,output);
                    synchronized(signal){try{signal.wait(100);}catch(InterruptedException ignored){}}
                }
                if(++batch%10==0||!requestedPlaying){
                    lastSnapshot=NativeAudio.snapshot(handle);
                    try{JSONObject state=new JSONObject(lastSnapshot);if("finished".equals(state.optString("phase"))&&!finishing){finishing=true;requestedPlaying=false;main.post(()->{manager.abandonAudioFocusRequest(focus);updateSession();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();});}}catch(JSONException ignored){}
                }
            }
        },"YohakuAudio");audioThread.start();updateSession();
        registerReceiver(noisy,new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
    }
    private final BroadcastReceiver noisy=new BroadcastReceiver(){@Override public void onReceive(Context context,Intent intent){play(false);}};
    @Override public int onStartCommand(Intent intent,int flags,int startId){startForeground(NOTIFICATION,notification());return START_NOT_STICKY;}
    @Override public IBinder onBind(Intent intent){return binder;}
    @Override public void onDestroy(){
        running=false;synchronized(signal){signal.notifyAll();}
        if(track!=null)track.pause();
        if(audioThread!=null){try{audioThread.join(2000);}catch(InterruptedException ignored){Thread.currentThread().interrupt();}}
        // Do not free audio memory while a blocked device write is still using it.
        if(audioThread==null||!audioThread.isAlive()){if(track!=null)track.release();if(handle!=0)NativeAudio.destroy(handle);handle=0;}
        if(manager!=null&&focus!=null)manager.abandonAudioFocusRequest(focus);if(session!=null)session.release();try{unregisterReceiver(noisy);}catch(IllegalArgumentException ignored){}super.onDestroy();
    }
}
