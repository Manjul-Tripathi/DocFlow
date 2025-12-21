/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck - Browser DOM APIs are available at runtime
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Header,
  Footer,
  PageNumber,
  convertInchesToTwip,
  HeadingLevel,
} from "docx";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import type { DocMetadata } from "../hooks/use-doc-store";

export interface ExportOptions {
  metadata: {
    title: string;
    author: string;
    lastUpdated: Date;
    headerContent: string;
    footerContent: string;
  };
  content: string;
  format: "doc" | "docx" | "pdf";
  returnBlob?: boolean; // If true, return blob instead of downloading
}

// Helper function to strip HTML tags and decode entities
const stripHtml = (html: string): string => {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// Helper function to parse HTML and convert to DOCX paragraphs
const parseHtmlToDocxElements = (html: string): Paragraph[] => {
  const elements: Paragraph[] = [];
  
  // Use browser's DOMParser to parse HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;
  
  const processElement = (element: any): void => {
    const tagName = element.tagName?.toLowerCase() || '';
    
    switch (tagName) {
      case 'p':
      case 'div': {
        const runs = extractTextRunsFromElement(element);
        if (runs.length > 0) {
          elements.push(new Paragraph({ children: runs }));
        }
        break;
      }
      case 'h1':
        elements.push(new Paragraph({
          children: extractTextRunsFromElement(element),
          heading: HeadingLevel.HEADING_1,
        }));
        break;
      case 'h2':
        elements.push(new Paragraph({
          children: extractTextRunsFromElement(element),
          heading: HeadingLevel.HEADING_2,
        }));
        break;
      case 'h3':
        elements.push(new Paragraph({
          children: extractTextRunsFromElement(element),
          heading: HeadingLevel.HEADING_3,
        }));
        break;
      case 'h4':
      case 'h5':
      case 'h6':
        elements.push(new Paragraph({
          children: extractTextRunsFromElement(element),
          heading: HeadingLevel.HEADING_4,
        }));
        break;
      case 'ul':
      case 'ol': {
        const listItems = element.querySelectorAll('li');
        listItems.forEach((li: any, index: number) => {
          const bullet = tagName === 'ol' ? `${index + 1}. ` : '• ';
          const runs = extractTextRunsFromElement(li);
          runs.unshift(new TextRun(bullet));
          elements.push(new Paragraph({ children: runs }));
        });
        break;
      }
      case 'blockquote': {
        const runs = extractTextRunsFromElement(element);
        elements.push(new Paragraph({
          children: runs,
          indent: { left: convertInchesToTwip(0.5) },
        }));
        break;
      }
      default: {
        // Process child elements
        if (element.children) {
          Array.from(element.children).forEach((child: any) => processElement(child));
        }
      }
    }
  };
  
  // Extract TextRuns from an element, preserving formatting
  const extractTextRunsFromElement = (element: any): TextRun[] => {
    const runs: TextRun[] = [];
    
    const processNode = (node: any, formatting: { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean } = {}): void => {
      // Text node (nodeType 3)
      if (node.nodeType === 3) {
        const text = node.textContent || '';
        if (text) {
          runs.push(new TextRun({
            text,
            bold: formatting.bold,
            italics: formatting.italic,
            underline: formatting.underline ? {} : undefined,
            strike: formatting.strike,
          }));
        }
        return;
      }
      
      // Element node (nodeType 1)
      if (node.nodeType !== 1) return;
      
      const tag = node.tagName?.toLowerCase() || '';
      const newFormatting = { ...formatting };
      
      switch (tag) {
        case 'strong':
        case 'b':
          newFormatting.bold = true;
          break;
        case 'em':
        case 'i':
          newFormatting.italic = true;
          break;
        case 'u':
          newFormatting.underline = true;
          break;
        case 's':
        case 'strike':
        case 'del':
          newFormatting.strike = true;
          break;
        case 'br':
          runs.push(new TextRun({ text: '', break: 1 }));
          return;
      }
      
      if (node.childNodes) {
        Array.from(node.childNodes).forEach((child: any) => processNode(child, newFormatting));
      }
    };
    
    if (element.childNodes) {
      Array.from(element.childNodes).forEach((child: any) => processNode(child));
    }
    
    // If no runs were created but there's text content, create a simple run
    if (runs.length === 0 && element.textContent?.trim()) {
      runs.push(new TextRun(element.textContent.trim()));
    }
    
    return runs;
  };
  
  // Process all top-level elements in body
  if (body && body.children) {
    Array.from(body.children).forEach((child: any) => processElement(child));
  }
  
  // If no elements were created, try to get text content
  if (elements.length === 0) {
    const plainText = stripHtml(html);
    if (plainText) {
      // Split by double newlines to create paragraphs
      const paragraphs = plainText.split(/\n\n+/);
      paragraphs.forEach(para => {
        if (para.trim()) {
          elements.push(new Paragraph({ children: [new TextRun(para.trim())] }));
        }
      });
    }
  }
  
  return elements;
};

// Helper function to convert HTML to RTF
const htmlToRtf = (html: string): string => {
  // Basic HTML to RTF conversion
  let rtf = "{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang1033\n";

  // Add document info
  rtf += "{\\info{\\title Document}\\author Author}\\n";

  // Convert HTML content
  rtf += html
    .replace(/<p>/g, "\\par ")
    .replace(/<\/p>/g, "\\par ")
    .replace(/<b>/g, "\\b ")
    .replace(/<\/b>/g, "\\b0 ")
    .replace(/<i>/g, "\\i ")
    .replace(/<\/i>/g, "\\i0 ")
    .replace(/<u>/g, "\\ul ")
    .replace(/<\/u>/g, "\\ul0 ")
    .replace(/<br>/g, "\\line ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  rtf += "}";
  return rtf;
};

export const exportDocument = async ({
  metadata,
  content,
  format,
  returnBlob = false,
}: ExportOptions): Promise<boolean | Blob> => {
  try {
    if (format === "doc") {
      // Convert content to RTF format
      const rtfContent = htmlToRtf(content);

      // Create a blob with the RTF content
      const blob = new Blob([rtfContent], { type: "application/rtf" });

      if (returnBlob) {
        return blob;
      }

      // Create a download link
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${metadata.title}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      return true;
    } else if (format === "docx") {
      // Parse HTML content to DOCX elements
      const docxElements = parseHtmlToDocxElements(content);
      
      // Create a new document with proper formatting
      const doc = new Document({
        title: metadata.title,
        creator: metadata.author,
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: convertInchesToTwip(1),
                  right: convertInchesToTwip(1),
                  bottom: convertInchesToTwip(1),
                  left: convertInchesToTwip(1),
                },
                size: {
                  width: convertInchesToTwip(8.5),
                  height: convertInchesToTwip(11),
                },
              },
            },
            headers: metadata.headerContent ? {
              default: new Header({
                children: [new Paragraph({ text: metadata.headerContent })],
              }),
            } : undefined,
            footers: metadata.footerContent ? {
              default: new Footer({
                children: [new Paragraph({ text: metadata.footerContent })],
              }),
            } : undefined,
            children: docxElements,
          },
        ],
      });

      // Generate the document as a blob
      const blob = await Packer.toBlob(doc);

      if (returnBlob) {
        return blob;
      }

      // Create a download link
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${metadata.title}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      return true;
    } else if (format === "pdf") {
      return await exportToPDF(metadata, content);
    }

    throw new Error(`Unsupported export format: ${format}`);
  } catch (error) {
    console.error("Error exporting document:", error);
    throw new Error("Failed to export document");
  }
};

const getHeaderContent = (
  metadata: DocMetadata,
  pageNumber: number,
  totalPages: number
) => {
  if (metadata.headerSettings.differentFirstPage && pageNumber === 1) {
    return metadata.headerSettings.firstPageContent || "";
  }
  if (metadata.headerSettings.differentOddEven) {
    return pageNumber % 2 === 0
      ? metadata.headerSettings.evenPageContent || ""
      : metadata.headerSettings.oddPageContent || "";
  }
  return metadata.headerContent;
};

const getFooterContent = (
  metadata: DocMetadata,
  pageNumber: number,
  totalPages: number
) => {
  let content = "";
  if (metadata.footerSettings.differentFirstPage && pageNumber === 1) {
    content = metadata.footerSettings.firstPageContent || "";
  } else if (metadata.footerSettings.differentOddEven) {
    content =
      pageNumber % 2 === 0
        ? metadata.footerSettings.evenPageContent || ""
        : metadata.footerSettings.oddPageContent || "";
  } else {
    content = metadata.footerContent;
  }

  return content
    .replace(/\[Page #\]/g, pageNumber.toString())
    .replace(/\[Total Pages\]/g, totalPages.toString())
    .replace(/\[Current Date\]/g, format(new Date(), "MMMM d, yyyy"));
};

const exportToPDF = async (metadata: DocMetadata, content: string) => {
  const element = document.querySelector(".editor-content");
  if (!element) throw new Error("Editor content not found");

  // Calculate total pages
  const contentHeight = element.scrollHeight;
  const a4Height = 1054; // A4 height in pixels at 96 DPI
  const totalPages = Math.ceil(contentHeight / a4Height);

  // Create PDF
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // For each page
  for (let page = 1; page <= totalPages; page++) {
    if (page > 1) pdf.addPage();

    // Add header if visible
    if (metadata.headerVisible) {
      const headerContent = getHeaderContent(metadata, page, totalPages);
      if (headerContent) {
        const headerElement = document.createElement("div");
        headerElement.innerHTML = headerContent;
        document.body.appendChild(headerElement);
        const headerCanvas = await html2canvas(headerElement);
        pdf.addImage(
          headerCanvas.toDataURL("image/jpeg", 1.0),
          "JPEG",
          10, // left margin
          10, // top margin
          190, // width (A4 width - margins)
          20 // height
        );
        document.body.removeChild(headerElement);
      }
    }

    // Add main content
    const canvas = await html2canvas(element as HTMLElement, {
      height: a4Height,
      windowHeight: a4Height,
      y: (page - 1) * a4Height,
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    pdf.addImage(
      canvas.toDataURL("image/jpeg", 1.0),
      "JPEG",
      10, // left margin
      40, // top margin (after header)
      190, // width (A4 width - margins)
      237 // height (A4 height - margins - header - footer)
    );

    // Add footer if visible
    if (metadata.footerVisible) {
      const footerContent = getFooterContent(metadata, page, totalPages);
      if (footerContent) {
        const footerElement = document.createElement("div");
        footerElement.innerHTML = footerContent;
        document.body.appendChild(footerElement);
        const footerCanvas = await html2canvas(footerElement);
        pdf.addImage(
          footerCanvas.toDataURL("image/jpeg", 1.0),
          "JPEG",
          10, // left margin
          277, // bottom margin
          190, // width (A4 width - margins)
          20 // height
        );
        document.body.removeChild(footerElement);
      }
    }
  }

  return pdf;
};

const exportToWord = async (metadata: DocMetadata, content: string) => {
  // Create sections for different header/footer configurations
  const sections = [];

  // First page section if different first page is enabled
  if (
    metadata.headerSettings.differentFirstPage ||
    metadata.footerSettings.differentFirstPage
  ) {
    sections.push({
      properties: {
        page: {
          size: {
            width: 12240, // Width in twentieths of a point (8.5 inches)
            height: 15840, // Height in twentieths of a point (11 inches)
          },
          margin: {
            top: 1440, // 1 inch in twentieths of a point
            right: 1440,
            bottom: 1440,
            left: 1440,
          },
        },
        titlePage: true,
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              text: metadata.headerSettings.firstPageContent || "",
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              text: metadata.footerSettings.firstPageContent || "",
            }),
          ],
        }),
      },
      children: [new Paragraph({ text: content })],
    });
  }

  // Main section
  sections.push({
    properties: {
      page: {
        size: {
          width: 12240,
          height: 15840,
        },
        margin: {
          top: 1440,
          right: 1440,
          bottom: 1440,
          left: 1440,
        },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({ text: metadata.headerContent })],
      }),
      ...(metadata.headerSettings.differentOddEven && {
        even: new Header({
          children: [
            new Paragraph({
              text: metadata.headerSettings.evenPageContent || "",
            }),
          ],
        }),
        odd: new Header({
          children: [
            new Paragraph({
              text: metadata.headerSettings.oddPageContent || "",
            }),
          ],
        }),
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            children: [
              new TextRun(metadata.footerContent),
              new TextRun({
                children: [PageNumber.CURRENT],
              }),
              new TextRun(" of "),
              new TextRun({
                children: [PageNumber.TOTAL_PAGES],
              }),
            ],
          }),
        ],
      }),
      ...(metadata.footerSettings.differentOddEven && {
        even: new Footer({
          children: [
            new Paragraph({
              text: metadata.footerSettings.evenPageContent || "",
            }),
          ],
        }),
        odd: new Footer({
          children: [
            new Paragraph({
              text: metadata.footerSettings.oddPageContent || "",
            }),
          ],
        }),
      }),
    },
    children: [new Paragraph({ text: content })],
  });

  // Create document
  const doc = new Document({
    sections,
  });

  // Generate blob
  const buffer = await Packer.toBlob(doc);
  return buffer;
};
