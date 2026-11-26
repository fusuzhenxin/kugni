"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Icon } from "./ui";
import { layoutViewport } from "@/lib/layout-viewport";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
export function WorkspaceSelect({
  id,
  value,
  options,
  onChange,
  label,
  disabled = false,
}: {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const uid = useId(),
    menuId = uid + "-options";
  const trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const selected = options.findIndex((option) => option.value === value);
  const enabled = options
    .map((o, index) => (o.disabled ? -1 : index))
    .filter((i) => i >= 0);
  const close = () => {
    menu.current?.hidePopover();
    setOpen(false);
  };
  const position = useCallback(() => {
    if (!trigger.current || !menu.current) return;
    const viewport = layoutViewport(trigger.current);
    const box = viewport.rect,
      panel = menu.current;
    const below = viewport.height - box.bottom - 12,
      above = box.top - 12;
    const height = Math.min(300, Math.max(below, above));
    const width = Math.min(Math.max(box.width, 160), viewport.width - 24);
    Object.assign(panel.style, {
      width: width + "px",
      maxHeight: height + "px",
      left:
        Math.max(12, Math.min(box.left, viewport.width - width - 12)) + "px",
      top: below >= Math.min(300, above) ? box.bottom + 6 + "px" : "auto",
      bottom:
        below >= Math.min(300, above)
          ? "auto"
          : viewport.height - box.top + 6 + "px",
    });
  }, []);
  useEffect(() => {
    if (!open) return;
    const reposition = (event: Event) => {
      if (event.target instanceof Node && menu.current?.contains(event.target))
        return;
      position();
    };
    window.addEventListener("resize", reposition);
    document.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [open, position]);
  const show = () => {
    if (disabled || !enabled.length) return;
    position();
    setActive(
      selected >= 0 && !options[selected].disabled ? selected : enabled[0],
    );
    menu.current!.showPopover();
    setOpen(true);
  };
  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    const panel = menu.current;
    const option = panel.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!option) return;
    const item = option.getBoundingClientRect(),
      box = panel.getBoundingClientRect();
    const { zoom } = layoutViewport(panel);
    // Scroll only the options, never an enclosing dialog or the page.
    if (item.top < box.top + 6)
      panel.scrollTop += (item.top - box.top - 6) / zoom;
    else if (item.bottom > box.bottom - 6)
      panel.scrollTop += (item.bottom - box.bottom + 6) / zoom;
  }, [open, active]);
  const choose = (index: number) => {
    if (options[index]?.disabled) return;
    onChange(options[index].value);
    close();
    trigger.current?.focus({ preventScroll: true });
  };
  const keydown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      ["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)
    )
      event.preventDefault();
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Tab") {
      close();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      if (open) choose(active);
      else show();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      if (!open) {
        show();
        return;
      }
      const current = enabled.indexOf(active),
        length = enabled.length;
      setActive(
        event.key === "Home"
          ? enabled[0]
          : event.key === "End"
            ? enabled[length - 1]
            : enabled[
                (current + (event.key === "ArrowDown" ? 1 : length - 1)) %
                  length
              ],
      );
    } else if (event.key.length === 1) {
      const matches = enabled.filter((i) =>
        options[i].label.toLowerCase().startsWith(event.key.toLowerCase()),
      );
      if (matches.length) {
        if (!open) show();
        setActive(matches.find((i) => i > active) ?? matches[0]);
      }
    }
  };
  return (
    <div className="workspace-select">
      <button
        ref={trigger}
        id={id}
        type="button"
        className="workspace-select-trigger"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="listbox"
        aria-activedescendant={open ? uid + "-" + active : undefined}
        disabled={disabled}
        onKeyDown={keydown}
        onClick={() => (open ? close() : show())}
      >
        <span>{options[selected]?.label || "请选择"}</span>
        <Icon name="chevron" size={15} />
      </button>
      <div
        ref={menu}
        id={menuId}
        popover="auto"
        className="workspace-select-menu"
        role="listbox"
        aria-label={label || "可选项"}
        onToggle={(event) =>
          setOpen(event.currentTarget.matches(":popover-open"))
        }
      >
        {options.map((option, index) => (
          <button
            key={option.value}
            id={uid + "-" + index}
            data-index={index}
            type="button"
            role="option"
            aria-selected={option.value === value}
            disabled={option.disabled}
            tabIndex={-1}
            className={active === index ? "highlighted" : ""}
            onMouseDown={(event) => event.preventDefault()}
            onPointerMove={() => !option.disabled && setActive(index)}
            onClick={() => choose(index)}
          >
            <span>{option.label}</span>
            {option.value === value && <Icon name="check" size={15} />}
          </button>
        ))}
      </div>
    </div>
  );
}
