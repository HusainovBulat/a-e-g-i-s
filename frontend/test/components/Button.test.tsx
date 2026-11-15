// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from '../../components/ui/Button';

describe('v1 Button progress', () => {
  it('renders an accessible in-button progress bar', () => {
    render(<Button size="sm" disabled progress={0.5}>INITIALIZATION</Button>);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.textContent).toContain('INITIALIZATION');
    expect(bar.textContent).toContain('50%');
    expect((bar as HTMLElement).style.minHeight).toBe('30px'); // size styles still applied
  });

  it('is a plain button without progress', () => {
    render(<Button>HOLD TO SPEAK</Button>);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
