package io.github.x10xtakayuki.yohaku;
final class NativeAudio {
    static { System.loadLibrary("yohaku"); }
    static native long create();
    static native void destroy(long handle);
    static native boolean command(long handle,int action,double a,double b,double c);
    static native void render(long handle,float[] output);
    static native String snapshot(long handle);
}
