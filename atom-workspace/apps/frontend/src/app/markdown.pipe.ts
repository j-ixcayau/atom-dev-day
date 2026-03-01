import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Lightweight pipe that converts a subset of Markdown to HTML.
 * Handles: bold, italic, unordered lists, ordered lists, headings, and line breaks.
 * No external dependency required.
 */
@Pipe({ name: 'markdown', standalone: true })
export class MarkdownPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';

    let html = this.escapeHtml(value);

    // Headings (### h3, ## h2, # h1) — must be at start of line
    html = html.replace(/^### (.+)$/gm, '<strong style="font-size:1.05em">$1</strong>');
    html = html.replace(/^## (.+)$/gm, '<strong style="font-size:1.1em">$1</strong>');
    html = html.replace(/^# (.+)$/gm, '<strong style="font-size:1.15em">$1</strong>');

    // Bold: **text** or __text__
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_ (but not inside already-processed bold)
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');

    // Unordered lists: lines starting with "- " or "* "
    html = html.replace(/^[\-\*] (.+)$/gm, '<li style="margin-left:1rem;list-style:disc">$1</li>');

    // Ordered lists: lines starting with "1. ", "2. ", etc.
    html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:1rem;list-style:decimal">$1</li>');

    // Inline code: `text`
    html = html.replace(/`([^`]+)`/g,
      '<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:0.9em">$1</code>');

    // Line breaks: convert remaining newlines to <br>
    html = html.replace(/\n/g, '<br>');

    // Clean up: merge consecutive <li> items (remove <br> between them)
    html = html.replace(/<\/li><br><li/g, '</li><li');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
