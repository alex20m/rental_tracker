// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { render } from './support/render';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Info, Money, Sheet } from '@/components/ui';

afterEach(cleanup);

describe('an info icon', () => {
  it('keeps its text hidden until the icon is clicked', async () => {
    render(
      <p>
        Rent <Info about="rent timing">Taxed in the year it is received.</Info>
      </p>,
    );
    expect(screen.queryByText(/taxed in the year/i)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'About rent timing' }));

    expect(screen.getByRole('note').textContent).toBe('Taxed in the year it is received.');
  });

  it('reports whether it is open to assistive technology', async () => {
    render(<Info about="x">hint</Info>);
    const icon = screen.getByRole('button', { name: 'About x' });
    expect(icon.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(icon);
    expect(icon.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes when the icon is clicked again', async () => {
    render(<Info about="x">hint</Info>);
    const icon = screen.getByRole('button', { name: 'About x' });
    await userEvent.click(icon);
    await userEvent.click(icon);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('closes on Escape', async () => {
    render(<Info about="x">hint</Info>);
    await userEvent.click(screen.getByRole('button', { name: 'About x' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('closes when something else is clicked', async () => {
    render(
      <>
        <Info about="x">hint</Info>
        <button>elsewhere</button>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'About x' }));
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('stays open when its own text is clicked, so the text can be selected', async () => {
    render(<Info about="x">hint</Info>);
    await userEvent.click(screen.getByRole('button', { name: 'About x' }));
    await userEvent.click(screen.getByRole('note'));
    expect(screen.getByRole('note')).toBeTruthy();
  });

  it('closes only the popover, not the sheet around it, on the first Escape', async () => {
    const onClose = vi.fn();
    render(
      <Sheet title="Edit" onClose={onClose}>
        <Info about="x">hint</Info>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'About x' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('note')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('a sheet', () => {
  it('is a named dialog', () => {
    render(
      <Sheet title="Add cost" onClose={() => {}}>
        body
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Add cost' })).toBeTruthy();
  });

  it('closes from its close button', async () => {
    const onClose = vi.fn();
    render(
      <Sheet title="T" onClose={onClose}>
        body
      </Sheet>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Sheet title="T" onClose={onClose}>
        body
      </Sheet>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is clicked but not when its content is', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <Sheet title="T" onClose={onClose}>
        <p>body</p>
      </Sheet>,
    );
    await userEvent.click(screen.getByText('body'));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(container.querySelector('.sheet-bg')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('a money amount', () => {
  it('reads as the plain formatted amount but sets the cents apart', () => {
    const { container } = render(<Money value={1234.5} />);
    expect(container.textContent?.replace(/\s/g, ' ')).toBe('1 234,50 €');
    expect(container.querySelector('.cents')?.textContent?.replace(/\s/g, ' ')).toBe(',50 €');
  });
});
