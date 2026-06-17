import { describe, expect, it } from 'vitest';
import { compact, escapeHtml, formatCountdown, formatDuration, initials } from './utils';

describe('utils', () => {
  it('formats compact numbers', () => {
    expect(compact(1234)).toBe('1.2K');
    expect(compact(9_800_000)).toBe('9.8M');
  });

  it('formats clip durations as m:ss', () => {
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(9)).toBe('0:09');
  });

  it('produces avatar initials', () => {
    expect(initials('Nova')).toBe('N');
    expect(initials('Friday Night Crew')).toBe('FN');
  });

  it('escapes HTML to prevent injection', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });

  it('shows "Live now" when countdown elapsed', () => {
    expect(formatCountdown(0)).toBe('Live now');
    expect(formatCountdown(-100)).toBe('Live now');
  });
});
