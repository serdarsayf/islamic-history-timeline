"use client";

import { useEffect, useState, type ReactNode } from "react";

type TooltipState = {
  text: string;
  x: number;
  y: number;
  below: boolean;
  visible: boolean;
};

type TooltipLayerProps = {
  children: ReactNode;
};

const INTERACTIVE_SELECTOR = "button, [role='button'], input:not([type='hidden']), select, textarea, [data-tooltip]";
const SHOW_DELAY_MS = 800;
const HIDE_DELAY_MS = 100;

function getTooltipText(element: HTMLElement) {
  const label = element.getAttribute("data-tooltip") ||
    element.getAttribute("title") ||
    element.getAttribute("aria-label") ||
    (element instanceof HTMLInputElement ? element.placeholder : "") ||
    element.closest("label")?.textContent ||
    element.textContent ||
    "";
  return label.replace(/\s+/g, " ").trim();
}

export default function TooltipLayer({ children }: TooltipLayerProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let removeTimer: ReturnType<typeof setTimeout> | null = null;
    let activeTarget: HTMLElement | null = null;
    let activeTitle: string | null = null;

    const clearTimer = (timer: ReturnType<typeof setTimeout> | null) => {
      if (timer !== null) clearTimeout(timer);
    };

    const restoreTitle = () => {
      if (activeTarget && activeTitle !== null) activeTarget.setAttribute("title", activeTitle);
      activeTitle = null;
    };

    const dismiss = () => {
      clearTimer(showTimer);
      showTimer = null;
      restoreTitle();
      setTooltip((current) => current ? { ...current, visible: false } : null);
      clearTimer(removeTimer);
      removeTimer = setTimeout(() => setTooltip(null), HIDE_DELAY_MS);
      activeTarget = null;
    };

    const show = (element: HTMLElement) => {
      clearTimer(showTimer);
      clearTimer(hideTimer);
      clearTimer(removeTimer);
      hideTimer = null;
      removeTimer = null;

      if (activeTarget === element) return;
      if (activeTarget !== null) {
        setTooltip((current) => current ? { ...current, visible: false } : null);
        clearTimer(removeTimer);
        removeTimer = setTimeout(() => setTooltip(null), HIDE_DELAY_MS);
      }
      restoreTitle();
      activeTarget = element;
      const text = getTooltipText(element);
      const title = element.getAttribute("title");
      if (title) {
        activeTitle = title;
        element.removeAttribute("title");
      }
      if (!text) return;

      showTimer = setTimeout(() => {
        const bounds = element.getBoundingClientRect();
        if (!element.isConnected) return;
        const below = bounds.top < 42;
        const x = Math.min(Math.max(bounds.left + bounds.width / 2, 120), window.innerWidth - 120);
        const y = below ? bounds.bottom + 8 : bounds.top - 8;
        setTooltip({ text, x, y, below, visible: true });
      }, SHOW_DELAY_MS);
    };

    const findTarget = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>(INTERACTIVE_SELECTOR) : null;

    const handlePointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const target = findTarget(event.target);
      if (target && !target.hasAttribute("data-no-tooltip")) show(target);
    };

    const handlePointerOut = (event: PointerEvent) => {
      const target = findTarget(event.target);
      if (!target || target !== activeTarget) return;
      const next = findTarget(event.relatedTarget);
      if (next === target) return;
      hideTimer = setTimeout(dismiss, HIDE_DELAY_MS);
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = findTarget(event.target);
      if (target && !target.hasAttribute("data-no-tooltip")) show(target);
    };

    const handleFocusOut = (event: FocusEvent) => {
      const target = findTarget(event.target);
      if (target && target === activeTarget && findTarget(event.relatedTarget) !== target) dismiss();
    };

    document.addEventListener("pointerover", handlePointerOver);
    document.addEventListener("pointerout", handlePointerOut);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      clearTimer(showTimer);
      clearTimer(hideTimer);
      clearTimer(removeTimer);
      restoreTitle();
      document.removeEventListener("pointerover", handlePointerOver);
      document.removeEventListener("pointerout", handlePointerOut);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  return (
    <>
      {children}
      {tooltip && (
        <div
          role="tooltip"
          className={`hover-tooltip${tooltip.visible ? " hover-tooltip--visible" : ""}${tooltip.below ? " hover-tooltip--below" : ""}`}
          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
        >
          {tooltip.text}
        </div>
      )}
    </>
  );
}
