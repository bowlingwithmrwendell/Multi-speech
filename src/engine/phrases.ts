// Localised system phrases spoken by the dialog engine. Add a language by adding a key.
export interface Phrases {
  defaultPraise: string;
  silenceFallback: string;
  missFallback: string;
  silenceRetry: string;
  missRetry: string;
  modeled: string; // {answer}
  modeledNoAnswer: string;
  moduleDone: string;
  greeting: string; // {name}
}

const PHRASES: Record<string, Phrases> = {
  en: {
    defaultPraise: 'Great job! {intent}!',
    silenceFallback: "Let's try it a different way.",
    missFallback: 'Good try! Let me help.',
    silenceRetry: "I'm listening! Take your time.",
    missRetry: "Let's try one more time.",
    modeled: "That's okay! One answer is {answer}. Let's keep going!",
    modeledNoAnswer: "That's okay! Let's keep going!",
    moduleDone: 'You did it! Great talking with you today!',
    greeting: "Hi {name}! Let's play and talk together!",
  },
  es: {
    defaultPraise: '¡Muy bien! ¡{intent}!',
    silenceFallback: 'Vamos a intentarlo de otra manera.',
    missFallback: '¡Buen intento! Te ayudo.',
    silenceRetry: '¡Te escucho! Tómate tu tiempo.',
    missRetry: 'Intentemos una vez más.',
    modeled: '¡Está bien! Una respuesta es {answer}. ¡Sigamos!',
    modeledNoAnswer: '¡Está bien! ¡Sigamos!',
    moduleDone: '¡Lo lograste! ¡Me encantó hablar contigo hoy!',
    greeting: '¡Hola {name}! ¡Vamos a jugar y hablar juntos!',
  },
};

export function phrasesFor(language: string): Phrases {
  return PHRASES[language] ?? PHRASES.en;
}

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
