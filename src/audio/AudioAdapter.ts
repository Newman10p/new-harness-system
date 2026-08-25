export interface SpeechToTextAdapter {
  transcribe(input: { filePath?: string; buffer?: Buffer }): Promise<string>;
}

export interface TextToSpeechAdapter {
  synthesize(text: string, options?: Record<string, unknown>): Promise<Buffer>;
}
