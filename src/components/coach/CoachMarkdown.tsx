"use client"

import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

/**
 * Maps Claude-style Markdown (bold, lists, links, fenced code, tables) to HTML
 * with Tailwind classes that match the coach bubble. No `rehype-raw` — only
 * parsed Markdown nodes are rendered (safe for streamed user+assistant text).
 */
export const coachMarkdownComponents: Components = {
  p: ({ children }) => (
    <p className="mb-2 last:mb-0 leading-relaxed [text-wrap:pretty]">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-foreground/95">{children}</em>,
  del: ({ children }) => (
    <del className="text-muted-foreground line-through decoration-muted-foreground/60">
      {children}
    </del>
  ),
  h1: ({ children }) => (
    <h3 className="mb-2 mt-3 first:mt-0 text-base font-semibold tracking-tight text-foreground">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h4 className="mb-1.5 mt-3 first:mt-0 text-sm font-semibold tracking-tight text-foreground">
      {children}
    </h4>
  ),
  h3: ({ children }) => (
    <h5 className="mb-1.5 mt-2 first:mt-0 text-sm font-semibold text-foreground">{children}</h5>
  ),
  h4: ({ children }) => (
    <h6 className="mb-1 mt-2 first:mt-0 text-[13px] font-semibold text-foreground">{children}</h6>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-outside list-disc space-y-1 pl-4 [text-wrap:pretty]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-outside list-decimal space-y-1 pl-4 [text-wrap:pretty]">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed [&>p]:mb-0">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-primary/35 bg-primary/[0.06] py-1.5 pl-3 pr-2 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-glass-border/60" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:text-primary/90 hover:decoration-primary/70"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    // Fenced blocks: `<pre><code class="language-…">`. Inline code: `<code>` only.
    const isFence =
      typeof className === "string" && /language-[\w-]+/.test(className)
    if (isFence) {
      return (
        <code className={cn("block font-mono text-[12px] text-foreground/95", className)} {...props}>
          {children}
        </code>
      )
    }
    return (
      <code
        className="rounded border border-glass-border/50 bg-muted/45 px-1 py-0.5 font-mono text-[12px] text-foreground/95"
        {...props}
      >
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-2 max-h-[min(50vh,22rem)] overflow-x-auto overflow-y-auto rounded-lg border border-glass-border/50 bg-muted/35 p-3 font-mono text-[12px] leading-snug text-foreground/95">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 w-full overflow-x-auto rounded-lg border border-glass-border/40">
      <table className="w-full min-w-[12rem] border-collapse text-left text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-glass-border/50 bg-muted/25">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-glass-border/35">{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="px-2 py-1.5 font-semibold text-foreground/90">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-2 py-1.5 align-top text-muted-foreground [text-wrap:pretty]">{children}</td>
  ),
}

interface CoachMarkdownProps {
  /** Raw Markdown from the model (may be incomplete while streaming). */
  content: string
  className?: string
}

export function CoachMarkdown({ content, className }: CoachMarkdownProps) {
  return (
    <div className={cn("coach-message-md min-w-0 [&>:first-child]:mt-0 [&>:last-child]:mb-0", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={coachMarkdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
