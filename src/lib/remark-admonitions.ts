import { visit } from "unist-util-visit";
import type { Root, Paragraph, Text } from "mdast";

// Custom remark plugin to handle Docusaurus-style admonitions
// Converts :::tip, :::warning, :::info, :::danger, :::note to InfoBox components

const ADMONITION_TYPES = ["tip", "warning", "info", "danger", "note", "caution"];

// Map admonition types to InfoBox types (caution -> warning)
const TYPE_MAP: Record<string, string> = {
  tip: "tip",
  warning: "warning",
  info: "info",
  danger: "danger",
  note: "note",
  caution: "warning",
};

export function remarkAdmonitions() {
  return (tree: Root) => {
    const nodesToProcess: Array<{
      parent: any;
      startIndex: number;
      endIndex: number;
      type: string;
      title?: string;
    }> = [];

    // First pass: identify admonition blocks
    visit(tree, "paragraph", (node: Paragraph, index: number | undefined, parent: any) => {
      if (index === undefined || !parent) return;

      const firstChild = node.children[0];
      if (firstChild?.type !== "text") return;

      const text = (firstChild as Text).value;

      // Check for opening :::type or :::type Title
      for (const type of ADMONITION_TYPES) {
        // Match :::type at the start of the line, with optional title
        const regex = new RegExp(`^:::${type}(?:\\s+(.*))?`, "im");
        const match = text.match(regex);

        if (match) {
          // Extract title (text after :::type on same line, before newline)
          const afterType = match[1] || "";
          const titleMatch = afterType.split("\n")[0].trim();
          const title = titleMatch || undefined;

          // Find the closing ::: - it could be in this paragraph or a later one
          let endIndex = -1;

          // Check if ::: is in the current paragraph text (self-contained admonition)
          if (text.includes("\n:::")) {
            endIndex = index;
          } else {
            // Look for closing ::: in subsequent nodes
            // Continue searching even past non-paragraph nodes (like lists)
            for (let i = index + 1; i < parent.children.length; i++) {
              const child = parent.children[i];
              if (child.type === "paragraph") {
                const childFirst = child.children?.[0];
                if (childFirst?.type === "text") {
                  const childText = (childFirst as Text).value;
                  // Check if this paragraph is the closing ::: or contains it
                  if (childText.trim() === ":::" || childText.startsWith(":::\n") || childText.includes("\n:::")) {
                    endIndex = i;
                    break;
                  }
                }
              }
              // Skip other node types (lists, code blocks, etc.) - they become content
            }
          }

          if (endIndex !== -1) {
            nodesToProcess.push({
              parent,
              startIndex: index,
              endIndex,
              type,
              title,
            });
          }
          break;
        }
      }
    });

    // Second pass: replace admonition blocks (in reverse order to maintain indices)
    nodesToProcess.reverse().forEach(({ parent, startIndex, endIndex, type, title }) => {
      // Extract content from the paragraphs
      const contentNodes: any[] = [];

      for (let i = startIndex; i <= endIndex; i++) {
        const node = parent.children[i];

        if (i === startIndex) {
          // For the opening paragraph, we need to remove the :::type line
          // but preserve all other children (including bold, links, etc.)
          if (node.type === "paragraph" && node.children?.length > 0) {
            const firstChild = node.children[0];
            if (firstChild?.type === "text") {
              const text = (firstChild as Text).value;
              const lines = text.split("\n");
              // Keep the remaining text without trimming to preserve spacing before bold/links
              const remainingText = lines.slice(1).join("\n");

              if (remainingText.trim() || node.children.length > 1) {
                // Create new paragraph with remaining content
                const newChildren = remainingText
                  ? [{ type: "text", value: remainingText }, ...node.children.slice(1)]
                  : node.children.slice(1);

                if (newChildren.length > 0) {
                  contentNodes.push({
                    type: "paragraph",
                    children: newChildren,
                  });
                }
              }
            }
          }
        } else if (i === endIndex) {
          // For the closing paragraph, remove the ::: but keep other content
          if (node.type === "paragraph" && node.children?.length > 0) {
            const lastChild = node.children[node.children.length - 1];
            if (lastChild?.type === "text") {
              const text = (lastChild as Text).value;
              const cleanedText = text.replace(/\n?:::$/, "").replace(/^:::$/, "").trim();

              if (cleanedText || node.children.length > 1) {
                const newChildren = cleanedText
                  ? [...node.children.slice(0, -1), { type: "text", value: cleanedText }]
                  : node.children.slice(0, -1);

                if (newChildren.length > 0 && !(newChildren.length === 1 && (newChildren[0] as Text).value === "")) {
                  contentNodes.push({
                    type: "paragraph",
                    children: newChildren,
                  });
                }
              }
            }
          }
        } else {
          // Keep intermediate nodes as-is
          contentNodes.push(node);
        }
      }

      // Create the InfoBox JSX
      const mappedType = TYPE_MAP[type] || type;
      const infoBoxNode = {
        type: "mdxJsxFlowElement",
        name: "InfoBox",
        attributes: [
          {
            type: "mdxJsxAttribute",
            name: "type",
            value: mappedType,
          },
          ...(title
            ? [
                {
                  type: "mdxJsxAttribute",
                  name: "title",
                  value: title,
                },
              ]
            : []),
        ],
        children: contentNodes,
      };

      // Replace the nodes
      parent.children.splice(startIndex, endIndex - startIndex + 1, infoBoxNode);
    });
  };
}
