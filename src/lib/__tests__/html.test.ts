import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../html';

describe('escapeHtml', () => {
  it('escapes markup characters so user text cannot inject tags', () => {
    expect(escapeHtml('<a href="https://evil">click</a> & \'x\'')).toBe(
      '&lt;a href=&quot;https://evil&quot;&gt;click&lt;/a&gt; &amp; &#39;x&#39;'
    );
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('Hello, Alice 123')).toBe('Hello, Alice 123');
  });
});
