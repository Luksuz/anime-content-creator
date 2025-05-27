"use server";

import { NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from "docx";
import { marked } from 'marked';

export async function POST(request: Request) {
  try {
    const { title, content } = await request.json();
    
    if (!title || !content) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create a new document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              text: title,
              heading: HeadingLevel.TITLE,
              spacing: {
                after: 400,
              },
              alignment: AlignmentType.CENTER,
            }),
            ...processMarkdownContent(content),
          ],
        },
      ],
    });

    // Generate the document
    const buffer = await Packer.toBuffer(doc);

    // Return the document as a downloadable file
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${title.replace(/\s+/g, "_")}.docx"`,
      },
    });
  } catch (error) {
    console.error("Error generating DOCX:", error);
    return NextResponse.json(
      { error: "Failed to generate DOCX" },
      { status: 500 }
    );
  }
}

// Process markdown content into DOCX paragraphs
function processMarkdownContent(content: string) {
  const paragraphs: Paragraph[] = [];
  
  // Parse the markdown
  const tokens = marked.lexer(content);
  
  for (const token of tokens) {
    if (token.type === 'heading') {
      // Handle headings
      const level = token.depth as number;
      const headingLevel = level === 2 ? HeadingLevel.HEADING_2 :
                          level === 3 ? HeadingLevel.HEADING_3 : 
                          HeadingLevel.HEADING_4;
      
      paragraphs.push(
        new Paragraph({
          text: token.text,
          heading: headingLevel,
          spacing: {
            before: 400,
            after: 200,
          },
        })
      );
    } else if (token.type === 'paragraph') {
      // Parse inline tokens for formatting
      const children: TextRun[] = [];
      
      if (typeof token.text === 'string') {
        const inlineTokens = marked.lexer(token.text, { gfm: true });
        parseInlineFormatting(token.text, children);
      }
      
      if (children.length > 0) {
        paragraphs.push(
          new Paragraph({
            children,
            spacing: {
              after: 200,
            },
          })
        );
      } else {
        // Fallback for regular text
        paragraphs.push(
          new Paragraph({
            text: token.text,
            spacing: {
              after: 200,
            },
          })
        );
      }
    } else if (token.type === 'blockquote' && token.tokens) {
      // Handle blockquotes (for dialogue)
      for (const bqToken of token.tokens) {
        if (bqToken.type === 'paragraph') {
          paragraphs.push(
            new Paragraph({
              text: bqToken.text,
              indent: {
                left: 720, // 0.5 inch
              },
              border: {
                left: {
                  color: "999999",
                  size: 6,
                  style: BorderStyle.SINGLE,
                  space: 10,
                },
              },
              spacing: {
                before: 120,
                after: 120,
              },
            })
          );
        }
      }
    } else if (token.type === 'space') {
      // Add empty paragraph for spacing
      paragraphs.push(new Paragraph({}));
    }
  }
  
  return paragraphs;
}

// Helper to parse inline formatting (bold, italic)
function parseInlineFormatting(text: string, children: TextRun[]) {
  // Simple regex-based approach
  // Note: This is a simplified approach and might not handle complex nested formatting
  
  // Regex patterns
  const boldPattern = /\*\*(.*?)\*\*/g;
  const italicPattern = /\*(.*?)\*/g;
  
  // Process bold first
  let currentText = text;
  let lastIndex = 0;
  let result;
  let segments: { text: string; bold?: boolean; italic?: boolean }[] = [];
  
  // Process bold
  while ((result = boldPattern.exec(currentText)) !== null) {
    if (result.index > lastIndex) {
      segments.push({ text: currentText.substring(lastIndex, result.index) });
    }
    segments.push({ text: result[1], bold: true });
    lastIndex = result.index + result[0].length;
  }
  
  if (lastIndex < currentText.length) {
    segments.push({ text: currentText.substring(lastIndex) });
  }
  
  // Process italic on each segment
  const finalSegments: { text: string; bold?: boolean; italic?: boolean }[] = [];
  
  for (const segment of segments) {
    if (segment.bold) {
      finalSegments.push(segment);
      continue;
    }
    
    let italicText = segment.text;
    let italicLastIndex = 0;
    let italicResult;
    
    while ((italicResult = italicPattern.exec(italicText)) !== null) {
      if (italicResult.index > italicLastIndex) {
        finalSegments.push({ 
          text: italicText.substring(italicLastIndex, italicResult.index) 
        });
      }
      finalSegments.push({ 
        text: italicResult[1], 
        italic: true 
      });
      italicLastIndex = italicResult.index + italicResult[0].length;
    }
    
    if (italicLastIndex < italicText.length) {
      finalSegments.push({ 
        text: italicText.substring(italicLastIndex) 
      });
    }
  }
  
  // Convert segments to TextRuns
  for (const segment of finalSegments) {
    if (segment.text.trim()) {
      children.push(
        new TextRun({
          text: segment.text,
          bold: segment.bold,
          italics: segment.italic,
          size: 24, // 12pt
        })
      );
    }
  }
} 