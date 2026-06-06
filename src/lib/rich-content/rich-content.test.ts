import { describe, expect, it } from 'vitest';
import { htmlToPlainText, plainTextToHtml, renderRichContentHtml, sanitizeRichHtml } from './index';

describe('rich content rendering', () => {
  it('sanitizes HTML and strips email images when disabled', () => {
    const html = sanitizeRichHtml(
      '<p>Hello <strong>reader</strong><script>alert(1)</script><img src="https://tracker.example/pixel.gif" alt="pixel"></p>',
      { allowImages: false }
    );

    expect(html).toContain('<strong>reader</strong>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
  });

  it('allows safe images for RSS/article content', () => {
    const html = sanitizeRichHtml('<p>Story</p><img src="https://example.com/photo.jpg" alt="Photo">', {
      allowImages: true,
    });

    expect(html).toContain('<img');
    expect(html).toContain('src="https://example.com/photo.jpg"');
  });

  it('renders plain text as readable markdown-like HTML', () => {
    const html = plainTextToHtml('# Heading\n\n- **One**\n- Two\n\nVisit https://example.com');

    expect(html).toContain('<h2>Heading</h2>');
    expect(html).toContain('<ul><li><strong>One</strong></li><li>Two</li></ul>');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>');
  });

  it('keeps auto-linked query string hrefs intact', () => {
    const html = plainTextToHtml('https://example.com/?a=1&b=2');

    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(html).toContain('https://example.com/?a=1&amp;b=2');
  });

  it('renders encoded feed HTML as HTML instead of escaped text', () => {
    const html = renderRichContentHtml('&lt;p&gt;Article &lt;em&gt;summary&lt;/em&gt;&lt;/p&gt;');

    expect(html).toContain('<p>Article <em>summary</em></p>');
  });

  it('extracts readable preview text from HTML', () => {
    expect(htmlToPlainText('<p>First&nbsp;line</p><p>Second &amp; third</p>')).toBe('First line\nSecond & third');
  });
});
