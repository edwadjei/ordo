import {
  TextModel,
  TextModelProviders,
  type TextModelRequest,
} from '../../capabilities/text-model.contract.js';

export const developmentTextModel = 'ordo-development-fake';

/**
 * A deterministic stand-in for every text provider, for `wrangler dev` only
 * (`ORDO_FAKE_TEXT_AI=on` with `ORDO_ENV=development`; refused otherwise). It
 * makes no network call. It reads the capture back out of the prompt and
 * returns a reply in the capture schema: up to three tasks from the first
 * sentences, one follow-up waiting on the first name it finds, one email
 * draft, and a destination that is high-confidence only when a listed
 * project's name or alias appears in the text.
 */
export class DevelopmentTextModel extends TextModel {
  readonly model = developmentTextModel;
  readonly maxInputCharacters = 64000;
  constructor(readonly provider: 'workers_ai' | 'openai' | 'anthropic') {
    super();
  }
  async generate(request: TextModelRequest) {
    return {
      output: developmentReply(request.prompt),
      usage: {
        inputTokens: Math.ceil(request.prompt.length / 4),
        outputTokens: 300,
        neurons: null,
      },
    };
  }
}

export class DevelopmentTextModelProviders extends TextModelProviders {
  workersAiAvailable() {
    return true;
  }
  workersAi() {
    return new DevelopmentTextModel('workers_ai');
  }
  openAi() {
    return new DevelopmentTextModel('openai');
  }
  anthropic() {
    return new DevelopmentTextModel('anthropic');
  }
}

const blankTask = {
  dueDate: null,
  dueTime: null,
  followUpDate: null,
  followUpTime: null,
  priority: null,
  responsiblePerson: null,
  waitingOn: null,
  isFollowUp: false,
};

export function developmentReply(prompt: string) {
  const today = /Today is \w+ (\d{4}-\d{2}-\d{2})/.exec(prompt)?.[1];
  const body =
    /<capture[^>]*>\n?([\s\S]*)\n?<\/capture>/.exec(prompt)?.[1].trim() ?? '';
  const projects = [
    ...prompt.matchAll(
      /- ref: (p\d+)\n {2}name: (.*)(?:\n {2}aliases: (.*))?/g,
    ),
  ].map((match) => ({
    ref: match[1],
    names: [match[2], ...(match[3]?.split('; ') ?? [])].map((name) =>
      name.toLowerCase(),
    ),
  }));
  const sentences = body
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 3);
  const titles = sentences.slice(0, 3).map((s) => s.slice(0, 200));
  // The first capitalised word that does not start a sentence, else none.
  const person = /(?<![.!?]\s|^)\b([A-Z][a-z]{2,})\b/m.exec(body)?.[1] ?? null;
  const tomorrow = today
    ? new Date(Date.parse(`${today}T00:00:00Z`) + 86400000)
        .toISOString()
        .slice(0, 10)
    : null;
  const tasks = titles.map((title, index) =>
    index === titles.length - 1 && person && titles.length > 1
      ? {
          ...blankTask,
          title: `Follow up: ${title}`.slice(0, 200),
          followUpDate: tomorrow,
          waitingOn: person,
          isFollowUp: true,
        }
      : {
          ...blankTask,
          title,
          dueDate: index === 0 ? tomorrow : null,
          priority: index === 0 ? 'high' : null,
        },
  );
  const lower = body.toLowerCase();
  const match = projects.find((project) =>
    project.names.some((name) => name && lower.includes(name)),
  );
  return {
    summary: `Development summary: ${sentences[0] ?? 'Empty capture.'}`.slice(
      0,
      400,
    ),
    tasks,
    drafts: titles.length
      ? [
          {
            kind: 'email',
            to: person,
            subject: `Follow-up: ${titles[0]}`.slice(0, 200),
            body: `Hi${person ? ` ${person}` : ''},\n\nFollowing up on: ${titles[0]}\n\nThanks`,
          },
        ]
      : [],
    destination: match
      ? {
          projectRef: match.ref,
          confidence: 'high',
          reason: 'The capture names this project.',
        }
      : {
          projectRef: null,
          confidence: 'low',
          reason: 'No project is named in the capture.',
        },
  };
}
