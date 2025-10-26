// Minimal global typings for the Web Speech API (SpeechRecognition)

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous?: boolean;
  start(): void;
  stop(): void;
  abort(): void;

  onaudiostart?: (ev: Event) => any;
  onaudioend?: (ev: Event) => any;
  onend?: (ev: Event) => any;
  onerror?: (ev: any) => any;
  onnomatch?: (ev: any) => any;
  onresult?: (ev: SpeechRecognitionEvent) => any;
  onsoundstart?: (ev: Event) => any;
  onsoundend?: (ev: Event) => any;
  onspeechstart?: (ev: Event) => any;
  onspeechend?: (ev: Event) => any;
  onstart?: (ev: Event) => any;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

declare global {
  interface Window {
    SpeechRecognition?: { new (): SpeechRecognition };
    webkitSpeechRecognition?: { new (): SpeechRecognition };
  }
}

export {};
