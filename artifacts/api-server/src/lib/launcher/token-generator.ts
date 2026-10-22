export type TokenGenerationInput = {
  name: string;
  description?: string;
};

export type GeneratedTokenConcept = {
  id: string;
  name: string;
  ticker: string;
  description: string;
  artworkSeed: string;
  generatedAt: Date;
  generationMode: "demo";
};

export interface TokenGenerator {
  readonly mode: "demo" | "openai";
  generate(input: TokenGenerationInput): Promise<GeneratedTokenConcept>;
}

function createTicker(name: string): string {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  const initials = words.map((word) => word[0]).join("");
  const normalized = (initials.length >= 2 ? initials : words.join(""))
    .slice(0, 5)
    .replace(/[^A-Z0-9]/g, "");
  return normalized.padEnd(3, "X");
}

export class DemoTokenGenerator implements TokenGenerator {
  readonly mode = "demo" as const;

  async generate(input: TokenGenerationInput): Promise<GeneratedTokenConcept> {
    const name = input.name.trim();
    const ticker = createTicker(name);
    const description =
      input.description?.trim() ||
      `${name} is a sample community-token concept with a playful, internet-native identity. This description was created in demo mode; no token or market exists.`;

    return {
      id: crypto.randomUUID(),
      name,
      ticker,
      description,
      artworkSeed: `${ticker.toLowerCase()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32)}`,
      generatedAt: new Date(),
      generationMode: "demo",
    };
  }
}

export class UnconfiguredOpenAiTokenGenerator implements TokenGenerator {
  readonly mode = "openai" as const;

  async generate(): Promise<GeneratedTokenConcept> {
    throw new Error(
      "OpenAI generation is not configured. The demo generator is active.",
    );
  }
}

export const tokenGenerator: TokenGenerator = new DemoTokenGenerator();
