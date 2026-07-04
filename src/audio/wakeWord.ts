export async function startWakeWordListener(onWake: () => void): Promise<void> {
  try {
    const { Porcupine, BuiltinKeyword } = await import("@picovoice/porcupine-node");
    const { PvRecorder } = await import("@picovoice/pvrecorder-node");

    const keyword = (BuiltinKeyword as any).JARVIS ?? (BuiltinKeyword as any).ALEXA;
    if (!keyword) {
      throw new Error("Porcupine keywords not available");
    }

    const porcupine = await (Porcupine as any).create(keyword);
    const recorder = new (PvRecorder as any)(porcupine.frameLength, -1);
    recorder.start();
    console.log("Wake word listener started. Say 'Jarvis' to trigger.");

    while (true) {
      const pcm = await recorder.read();
      const result = porcupine.process(pcm);
      if (result === 0) {
        continue;
      }
      onWake();
    }
  } catch (error) {
    console.error("Wake word listener initialization failed:", error);
    console.log("Falling back to polling mode (wake word detection disabled).");
    // Graceful fallback: do nothing, let the harness run without wake word
  }
}
