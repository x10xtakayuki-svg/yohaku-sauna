# 余白：スマートフォン版の開発プレビュー

セルフ／オートの2つの入口と既存のCanvas画面を再利用し、音の生成・石の状態・注水・終了タイマーをC++の共通エンジンへ移した試作です。WebViewやJavaScriptのタイマーが休止しても、OSの音声コールバックから進行します。

**現時点で実機の画面ロック・省電力・通話後の復帰を保証するリリースではありません。** クラウドでのビルドと共通エンジンの検査を経たうえで、実機での確認が必要です。ストア登録や課金は行いません。

## 構成

- `core/`：24個の石の熱・水モデル、雨だれ・水糸・一分の波、減衰後の余白、有限帯域の1/fを意識した揺らぎ、PCM音声合成。48kHzのサンプル数を時計にします。
- `ios/`：AVAudioSourceNodeとAVAudioEngine、再生用AVAudioSession、バックグラウンドaudio設定、ロック画面の再生／一時停止、通話・イヤホン取り外しへの対応。
- `android/`：同じエンジンをAudioTrackへ出力する専用スレッド、mediaPlaybackフォアグラウンドサービス、MediaSession、通知とロック画面操作、音声フォーカスへの対応。
- `shared/`：端末に同梱した画面とネイティブ音声をつなぐ限定ブリッジ。外部ページへの移動は許可せず、UIはオフラインで動きます。

音の設計はWeb版をもとにしていますが、ブラウザの音声ノードと完全に同じ波形ではありません。特に室内の反射は軽量なディレイ網へ置き換えています。「ボーッ」という背景音、鋭さ、音量、減衰の聴き心地はWeb版と実機で聴き比べて調整します。

## ビルドと検査

リポジトリのルートで `node mobile/scripts/bundle.mjs` を実行すると、既存の画面を両アプリへコピーします。コピー先は生成物としてGit管理から除外し、元の `public/` を編集します。Google Fontsへの参照は同梱時に外し、端末の日本語フォントを使います。

GitHub Actionsの **Check mobile background audio** が次を実行します。

1. Web版の既存検査と、ネイティブブリッジの検査。
2. C++をコンパイルし、UIの更新なしにオート・余韻・余白・終了タイマーが進むこと、PCMが有限値であることを検査。90秒の試聴用WAVも生成。
3. macOS上でiPhoneシミュレーター向けに署名なしでビルド。
4. AndroidのデバッグAPKをビルド。

Actionsの成果物は14日間保存します。**iOSのシミュレーター成果物は、iPhoneにインストールできません。** AndroidのデバッグAPKは試作用で、ストア公開用の署名はまだ設定していません。

## iPhoneに配布する前に必要なこと

利用者のApple Developer Program登録後に、App Store Connect上のアプリ、固有のBundle ID、署名と配布用認証、アプリアイコンを整えます。Macが手元になくても、クラウドのmacOSビルド環境で署名する構成へ進められます。認証情報はGitHubのSecretsなどに保存し、ソースやチャットには書きません。

TestFlightへのアップロードは未実施です。登録・年会費・ストア提出は、利用者自身の判断と操作が必要です。

## 実機での受け入れ確認

- iPhoneをロックして、水糸／一分の波を各10分以上聴く。次の注水が消えた余韻を急かさないこと。
- 画面を消している間に終了タイマーが作動し、ベルなしで消音すること。
- ロック画面で一時停止／再開。休止中はロウリュの時計が進まないこと。
- 通話・別の音声アプリ・イヤホン取り外し・Bluetooth切り替えから安全に復帰できること。
- 画面に戻ったときの音量、モード、注水位置、残り時間が実際の音と一致すること。
- Androidでも同じ確認を行い、省電力設定・通知・長時間の再生・発熱と電池消費を確認すること。

強制終了やOSによるプロセス終了後の自動再生は行いません。画面ロック中の動作確認は、シミュレーターのビルド検査だけでは代替できません。

## 参照した公式仕様

- [Apple: playback category and background audio](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playback)
- [Apple: AVAudioSourceNode](https://developer.apple.com/documentation/avfaudio/avaudiosourcenode)
- [Android: background playback](https://developer.android.com/media/media3/session/background-playback)
- [Android: media playback foreground service](https://developer.android.com/develop/background-work/services/fgs/service-types#media)
