import { dedent as tsdedent } from "ts-dedent";

export const Symbol = {
  Bulb: "💡",
  Exclamation: "❗",
  GreenSquare: "🟩",
  HeavyAsterisk: "✱",
  HourglassFlowingSand: "⏳",
  MiddleDot: "·",
  RedSquare: "🟥",
  RightwardsArrow: "→",
  SpeechBalloon: "💬",
  Warning: "⚠️",
  WhiteCheckMark: "✅",
  WhiteLargeSquare: "⬜",
  Zap: "⚡",
};

export const Bold = (content: string) => `<b>${content}</b>`;

export const CodeInline = (content: string) => `<code>${content}</code>`;

export const Comment = (content: string) => `<!-- ${content} -->`;

export const Italic = (content: string) => `<i>${content}</i>`;

export function Dedent(
  templ: string | TemplateStringsArray,
  ...args: unknown[]
): string {
  return (
    tsdedent(templ, ...args)
      .trim()
      // Wrapping dedent to remove lines that only contain spaces.
      // Here's the corresponding bug report: https://github.com/tamino-martinius/node-ts-dedent/issues/37
      .replaceAll(/\n\s*\n/gi, "\n\n")
  );
}

export const Blockquote = (content: string) =>
  Dedent`
    <blockquote>

    ${content}

    </blockquote>
  `;

export const CodeBlock = (
  props: string | { content: string; language?: string },
): string => {
  const delimiter = "```";
  const content = typeof props === "string" ? props : props.content;
  const language = typeof props === "string" ? "" : props.language;

  return Dedent`
    ${delimiter}${language}
    ${content}
    ${delimiter}
  `;
};

export const Details = ({
  summary,
  body,
  indent = true,
  open = false,
}: {
  summary: string;
  body: string;
  indent?: boolean;
  open?: boolean;
}) => {
  return Dedent`
    <details${open ? " open" : ""}>
    <summary>${summary}</summary>

    ${indent ? Blockquote(body) : body}

    </details>
  `;
};

export const Heading = (content: string) => `<h3>${content}</h3>`;

export const Link = ({ text, href }: { text: string; href: string }) =>
  `<a href="${href}">${text}</a>`;

export const List = (lines: string[]) => {
  return Dedent`
    <ul>
    ${lines.map((line) => `<li>${line}</li>`).join("\n")}
    </ul>
  `;
};

export const Rule = () => `<hr />`;
