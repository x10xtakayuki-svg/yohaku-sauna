/* Loaded only inside the trusted, bundled mobile document. */
(() => {
  const ios=window.webkit?.messageHandlers?.yohaku,android=window.YohakuHost;
  if(!ios&&!android)return;
  window.YohakuNative=Object.freeze({send(command){
    if(ios)ios.postMessage(command);else android.postMessage(JSON.stringify(command));
  }});
})();
