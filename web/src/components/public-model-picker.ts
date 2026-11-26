import {
  groupModelChoices,
  modelBrand,
  modelBrandIcon,
} from "@/presentation/model-catalog.mjs";
import { layoutViewport } from "@/lib/layout-viewport";

const chevron =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg>';
const fallback =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/></svg>';
type Choice = { id: string; brand: string; label: string };

// Enhance server-rendered inputs; their native datalists remain usable without JS.
export function enhanceModelPickers(
  root: HTMLElement,
  t: (text: string) => string,
) {
  const cleanup: (() => void)[] = [];
  for (const input of root.querySelectorAll<HTMLInputElement>(
    "[data-model-picker]",
  )) {
    const field = input.closest<HTMLElement>("[data-model-field]")!;
    const listId = input.getAttribute("list")!;
    const datalist = field.querySelector<HTMLDataListElement>("datalist")!;
    const mark = field.querySelector<HTMLElement>("[data-model-mark]")!;
    const controller = new AbortController();
    const { signal } = controller;
    const menu = document.createElement("div");
    menu.className = "public-model-menu";
    menu.setAttribute("popover", "manual");
    const caption = document.createElement("p");
    caption.className = "public-model-caption";
    const options = document.createElement("div");
    options.id = input.id + "-listbox";
    options.setAttribute("role", "listbox");
    options.setAttribute("aria-label", input.getAttribute("aria-label")!);
    const note = document.createElement("p");
    note.className = "public-model-note";
    note.textContent = t("可直接填写模型 ID；可用型号以当前 Key 为准");
    menu.append(caption, options, note);
    field.append(menu);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "public-model-toggle";
    toggle.innerHTML = chevron;
    toggle.setAttribute("aria-label", t("展开模型列表"));
    toggle.setAttribute("aria-controls", options.id);
    field.append(toggle);
    input.removeAttribute("list");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-haspopup", "listbox");
    input.setAttribute("aria-controls", options.id);
    input.setAttribute("aria-expanded", "false");
    let choices: Choice[] = [],
      matches: Choice[] = [],
      active = -1,
      limit = 120;
    let open = false;
    const read = () => {
      choices = groupModelChoices(
        [...datalist.options].map((option) => ({
          id: option.value,
          brand: option.dataset.brand || modelBrand(option.value)?.key || "",
          label: option.label,
        })),
      );
    };
    const updateMark = () => {
      mark.innerHTML = modelBrandIcon(input.value) || fallback;
    };
    const position = () => {
      if (!open) return;
      const viewport = layoutViewport(field);
      const { rect } = viewport;
      const width = Math.min(Math.max(rect.width, 360), viewport.width - 24);
      const below = viewport.height - rect.bottom - 18,
        above = rect.top - 18;
      // Prefer the expected downward direction, using a shorter scrollable list.
      // Only flip when even two options would not fit underneath the field.
      const down = below >= 160 || below >= above;
      const height = Math.max(0, Math.min(360, down ? below : above));
      menu.style.width = width + "px";
      menu.style.maxHeight = height + "px";
      menu.style.left =
        Math.max(12, Math.min(rect.left, viewport.width - width - 12)) + "px";
      menu.style.top = down
        ? rect.bottom + 6 + "px"
        : Math.max(12, rect.top - Math.min(menu.scrollHeight, height) - 6) +
          "px";
    };
    const close = () => {
      if (!open) return;
      open = false;
      if (menu.isConnected && menu.matches(":popover-open")) menu.hidePopover();
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      toggle.setAttribute("aria-expanded", "false");
    };
    const select = (choice: Choice) => {
      input.value = choice.id;
      updateMark();
      close();
      input.focus({ preventScroll: true });
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      // The input event updates its mark but must not reopen the selected list.
      close();
    };
    const highlight = (index: number) => {
      active = index;
      for (const item of options.children) item.classList.remove("is-active");
      const item = options.children[index] as HTMLElement | undefined;
      if (item) {
        item.classList.add("is-active");
        input.setAttribute("aria-activedescendant", item.id);
        item.scrollIntoView({ block: "nearest" });
      }
    };
    const draw = () => {
      options.replaceChildren();
      for (const [index, choice] of matches.slice(0, limit).entries()) {
        const item = document.createElement("div");
        item.className = "public-model-option";
        item.id = options.id + "-" + index;
        item.dataset.index = String(index);
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(choice.id === input.value));
        const icon = document.createElement("span");
        icon.className = "public-model-option-mark";
        icon.innerHTML =
          modelBrandIcon(choice.id, "brand-icon", choice.brand) || fallback;
        const name = document.createElement("span");
        name.className = "public-model-option-name";
        name.textContent = choice.id;
        const brand = document.createElement("small");
        brand.textContent =
          modelBrand(choice.id, choice.brand)?.label || t("其他模型");
        name.append(brand);
        const check = document.createElement("span");
        check.className = "public-model-check";
        check.textContent = choice.id === input.value ? "✓" : "";
        check.setAttribute("aria-hidden", "true");
        item.append(icon, name, check);
        options.append(item);
      }
      caption.textContent = matches.length
        ? t("匹配型号") +
          " · " +
          matches.length +
          (matches.length > limit ? " · " + t("向下滚动查看更多") : "")
        : t("未找到匹配型号，可直接使用输入的 ID");
      input.removeAttribute("aria-activedescendant");
      active = -1;
      position();
    };
    const show = (filter = false) => {
      const query = filter ? input.value.trim().toLowerCase() : "";
      matches = choices.filter(
        (choice) =>
          !query ||
          (choice.id + " " + choice.brand + " " + choice.label)
            .toLowerCase()
            .includes(query),
      );
      limit = 120;
      draw();
      if (!open) {
        open = true;
        menu.showPopover();
      }
      input.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-expanded", "true");
      menu.scrollTop = 0;
      position();
    };
    input.addEventListener("click", () => show(), { signal });
    input.addEventListener(
      "input",
      () => {
        updateMark();
        show(true);
      },
      { signal },
    );
    input.addEventListener("change", updateMark, { signal });
    input.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          close();
          return;
        }
        if (event.key === "Tab") {
          close();
          return;
        }
        if (event.key === "Enter" && open && active >= 0) {
          event.preventDefault();
          select(matches[active]);
        } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          if (!open) show();
          if (!matches.length) return;
          const next =
            active < 0
              ? event.key === "ArrowDown"
                ? 0
                : matches.length - 1
              : (active +
                  (event.key === "ArrowDown" ? 1 : matches.length - 1)) %
                matches.length;
          if (next >= limit) {
            limit = next + 1;
            draw();
          }
          highlight(next);
        }
      },
      { signal },
    );
    toggle.addEventListener(
      "click",
      () => {
        input.focus({ preventScroll: true });
        if (open) close();
        else show();
      },
      { signal },
    );
    menu.addEventListener(
      "pointerdown",
      (event) => {
        if (
          event.pointerType === "mouse" &&
          (event.target as HTMLElement).closest("[data-index]")
        )
          event.preventDefault();
      },
      { signal },
    );
    menu.addEventListener(
      "click",
      (event) => {
        // The homepage field lives inside a label. Cancel its default click
        // forwarding so choosing an option does not reopen the input menu.
        event.preventDefault();
        event.stopPropagation();
        const item = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-index]",
        );
        if (item) select(matches[Number(item.dataset.index)]);
      },
      { signal },
    );
    menu.addEventListener(
      "scroll",
      () => {
        if (
          menu.scrollTop + menu.clientHeight >= menu.scrollHeight - 60 &&
          limit < matches.length
        ) {
          const previousActive = active;
          limit += 120;
          draw();
          if (previousActive >= 0) highlight(previousActive);
        }
      },
      { signal },
    );
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!field.contains(event.target as Node)) close();
      },
      { signal },
    );
    document.addEventListener(
      "focusin",
      (event) => {
        if (!field.contains(event.target as Node)) close();
      },
      { signal },
    );
    window.addEventListener("resize", position, { signal });
    window.addEventListener("scroll", position, { signal, capture: true });
    input.addEventListener(
      "kugni:models",
      () => {
        read();
        updateMark();
        close();
      },
      { signal },
    );
    read();
    updateMark();
    cleanup.push(() => {
      close();
      controller.abort();
      menu.remove();
      toggle.remove();
      input.setAttribute("list", listId);
      for (const attr of [
        "role",
        "aria-autocomplete",
        "aria-haspopup",
        "aria-controls",
        "aria-expanded",
        "aria-activedescendant",
      ])
        input.removeAttribute(attr);
    });
  }
  return () => cleanup.forEach((dispose) => dispose());
}
