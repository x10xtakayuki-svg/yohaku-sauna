package io.github.x10xtakayuki.yohaku;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.IBinder;
import android.content.*;
import android.graphics.Color;
import android.webkit.*;
import android.net.Uri;
import org.json.*;
import java.util.ArrayDeque;

public final class MainActivity extends Activity {
    private WebView web;
    private SaunaService service;
    private boolean binding=false,visible=false,loaded=false;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ArrayDeque<JSONObject> pending=new ArrayDeque<>();
    private final ServiceConnection connection=new ServiceConnection(){
        public void onServiceConnected(ComponentName name,IBinder binder){service=((SaunaService.LocalBinder)binder).service();while(!pending.isEmpty())service.command(pending.removeFirst());}
        public void onServiceDisconnected(ComponentName name){service=null;binding=false;}
    };
    private void ensureService(){
        if(service!=null)return;
        Intent intent=new Intent(this,SaunaService.class);startForegroundService(intent);
        if(!binding)binding=bindService(intent,connection,Context.BIND_AUTO_CREATE);
    }
    private final Runnable poll=new Runnable(){public void run(){
        if(visible&&loaded&&service!=null){emit("yohaku-native-state",service.snapshot());String error=service.takeError();if(error!=null)emit("yohaku-native-error",JSONObject.quote(error),true);}
        if(visible)main.postDelayed(this,150);
    }};
    private void emit(String name,String json){emit(name,json,false);}
    private void emit(String name,String json,boolean error){
        String payload=error?"{\"message\":"+json+"}":json;
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('"+name+"',{detail:"+payload+"}));",null);
    }
    private final class Bridge {
        @JavascriptInterface public void postMessage(String message){
            if(message.length()>4096)return;
            main.post(()->{try{
                JSONObject command=new JSONObject(message);String type=command.optString("type");
                boolean play="start".equals(type)||("playing".equals(type)&&command.optBoolean("value"));
                if(service==null){
                    if("stop".equals(type)){pending.clear();return;}
                    if("settings".equals(type)||"duration".equals(type))pending.removeIf(old->type.equals(old.optString("type")));
                    if(pending.size()>=128){pending.clear();emit("yohaku-native-error",JSONObject.quote("操作が混み合っています。もう一度お試しください。"),true);return;}
                    pending.addLast(command);if(play)ensureService();
                }else{if(play)startForegroundService(new Intent(MainActivity.this,SaunaService.class));service.command(command);}
            }catch(JSONException ignored){}});
        }
    }
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);getWindow().setStatusBarColor(Color.rgb(20,27,24));getWindow().setNavigationBarColor(Color.rgb(20,27,24));
        web=new WebView(this);web.setBackgroundColor(Color.rgb(20,27,24));setContentView(web);
        web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new Bridge(),"YohakuHost");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){Uri url=request.getUrl();return !"file".equals(url.getScheme())||url.getPath()==null||!url.getPath().startsWith("/android_asset/Web/");}
            @Override public void onPageFinished(WebView view,String url){loaded=true;}
        });
        web.loadUrl("file:///android_asset/Web/index.html");
        // Reattach an already-playing service without starting audio on launch.
        binding=bindService(new Intent(this,SaunaService.class),connection,0);
    }
    @Override public void onResume(){super.onResume();visible=true;main.removeCallbacks(poll);main.post(poll);}
    @Override public void onPause(){visible=false;main.removeCallbacks(poll);super.onPause();}
    @Override public void onDestroy(){visible=false;main.removeCallbacks(poll);if(binding)unbindService(connection);web.removeJavascriptInterface("YohakuHost");web.destroy();super.onDestroy();}
}
