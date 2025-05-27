import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function removeMarkdown(markdownText: string): string {
  if (!markdownText) {
    return "";
  }

  let text = markdownText;

  // Remove headings (e.g., # Heading, ## Heading)
  text = text.replace(/^#+\s+(.*)/gm, '$1');

  // Remove bold (e.g., **bold**, __bold__)
  text = text.replace(/\*\*(.*?)\*\*|__(.*?)__/g, '$1$2');

  // Remove italic (e.g., *italic*, _italic_)
  // Should be run after bold to handle ***bold-italic*** correctly (leaves *italic*)
  text = text.replace(/\*(.*?)\*|_(.*?)_/g, '$1$2');
  
  // Remove strikethrough (e.g., ~~strikethrough~~)
  text = text.replace(/~~(.*?)~~/g, '$1');

  // Remove links (e.g., [link text](url)) - keeping the link text
  text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');

  // Remove images (e.g., ![alt text](url)) - keeping the alt text
  text = text.replace(/!\[(.*?)\]\(.*?\)/g, '$1');

  // Remove inline code (e.g., `code`)
  text = text.replace(/`([^`]+)`/g, '$1');

  // Remove code blocks (e.g., ```code block```) - remove content as well
  text = text.replace(/```[\s\S]*?```/g, '');
  
  // Remove blockquotes (e.g., > quote)
  text = text.replace(/^>\s+(.*)/gm, '$1');

  // Remove horizontal rules (e.g., ---, ***, ___)
  text = text.replace(/^---$|^\*\*\*$|^___$/gm, '');

  // Remove unordered list items (e.g., - item, * item, + item)
  text = text.replace(/^[\-\*\+]\s+(.*)/gm, '$1');

  // Remove ordered list items (e.g., 1. item)
  text = text.replace(/^\d+\.\s+(.*)/gm, '$1');

  // Replace multiple newlines with a single newline
  text = text.replace(/\n{2,}/g, '\\n');

  // Trim leading/trailing whitespace from each line and the whole text
  text = text.split('\\n').map(line => line.trim()).join('\\n').trim();

  return text;
} 