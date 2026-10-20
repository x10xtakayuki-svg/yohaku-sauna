#include <jni.h>
#include <sstream>
#include "../../../../../core/SaunaEngine.hpp"
using yohaku::SaunaEngine;
extern "C" {
JNIEXPORT jlong JNICALL Java_io_github_x10xtakayuki_yohaku_NativeAudio_create(JNIEnv*,jclass){try{return reinterpret_cast<jlong>(new SaunaEngine(48000));}catch(...){return 0;}}
JNIEXPORT void JNICALL Java_io_github_x10xtakayuki_yohaku_NativeAudio_destroy(JNIEnv*,jclass,jlong handle){delete reinterpret_cast<SaunaEngine*>(handle);}
JNIEXPORT jboolean JNICALL Java_io_github_x10xtakayuki_yohaku_NativeAudio_command(JNIEnv*,jclass,jlong handle,jint action,jdouble a,jdouble b,jdouble c){
    return handle&&action>=0&&action<=10&&reinterpret_cast<SaunaEngine*>(handle)->enqueue({static_cast<yohaku::Action>(action),a,b,c});
}
JNIEXPORT void JNICALL Java_io_github_x10xtakayuki_yohaku_NativeAudio_render(JNIEnv *env,jclass,jlong handle,jfloatArray output){
    if(!handle)return;const int frames=env->GetArrayLength(output)/2;if(frames<=0||frames>4096)return;
    auto *p=static_cast<jfloat*>(env->GetPrimitiveArrayCritical(output,nullptr));if(!p)return;
    reinterpret_cast<SaunaEngine*>(handle)->render(p,p+1,frames,2);env->ReleasePrimitiveArrayCritical(output,p,0);
}
JNIEXPORT jstring JNICALL Java_io_github_x10xtakayuki_yohaku_NativeAudio_snapshot(JNIEnv *env,jclass,jlong handle){
    if(!handle)return env->NewStringUTF("{}");const auto s=reinterpret_cast<SaunaEngine*>(handle)->snapshot();
    const char *modes[]={"manual","auto"},*patterns[]={"drops","thread","wave"},*phases[]={"idle","free","settling","finished"};
    std::ostringstream o;o.precision(12);
    o<<"{\"version\":1,\"started\":"<<(s.started?"true":"false")<<",\"playing\":"<<(s.playing?"true":"false")<<",\"pouring\":"<<(s.pouring?"true":"false")<<",\"mode\":\""<<modes[s.mode]<<"\",\"pattern\":\""<<patterns[s.pattern]<<"\",\"phase\":\""<<phases[s.phase]<<"\",\"elapsed\":"<<s.elapsed<<",\"gain\":"<<s.gain<<",\"water\":"<<s.water<<",\"stream\":"<<s.stream<<",\"pourX\":"<<s.pourX<<",\"pourY\":"<<s.pourY<<",\"tailTime\":"<<s.tailTime<<",\"waterLevel\":"<<s.waterLevel<<",\"roomLevel\":"<<s.roomLevel<<",\"stones\":[";
    for(int i=0;i<24;i++){const auto& t=s.stones[i];if(i)o<<",";o<<"{\"x\":"<<t.x<<",\"y\":"<<t.y<<",\"surface\":"<<t.surface<<",\"core\":"<<t.core<<",\"water\":"<<t.water<<",\"evaporation\":"<<t.evap<<",\"wet\":"<<t.wet<<",\"light\":"<<t.light<<"}";}
    o<<"]}";return env->NewStringUTF(o.str().c_str());
}
}
