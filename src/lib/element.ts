import { ElementType } from "domelementtype";
import type { DOMNode } from "html-dom-parser";

export function textContent(elem: DOMNode): string {
  switch (elem.type) {
    case ElementType.Text:
      return elem.data;
    case ElementType.Tag:
      return elem.children
        .map((child) => textContent(child as DOMNode))
        .join("");
    default:
      return "";
  }
}
