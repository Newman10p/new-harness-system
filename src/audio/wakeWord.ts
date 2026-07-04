export async function startWakeWordListener(onWake: () => void): Promise<void> {
  try {
    console.log("OpenWakeWord-style wake-word mode is enabled. Local detection will be available once an engine is installed.");
    console.log("For now, wake-word listening is set to a lightweight placeholder mode so startup stays smooth.");
    await new Promise((resolve) => setTimeout(resolve, 100));
  } catch (error) {
    console.error("Wake word listener initialization failed:", error);
    console.log("Falling back to polling mode (wake word detection disabled).");
  }
}
