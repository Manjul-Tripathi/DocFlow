import React from 'react';
import {
  MousePointer2,
  Type,
  Pencil,
  Highlighter,
  Square,
  Circle,
  Minus,
  ArrowRight,
  Eraser,
  Image as ImageIcon,
  Undo2,
  Redo2,
  Save,
  Download,
  ZoomIn,
  ZoomOut,
  Trash2,
  Loader2,
  Hand,
  Bold,
  Italic,
  Underline,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import type { ToolType } from '../types';
import { COLORS, FONT_SIZES, FONT_FAMILIES } from '../constants';

interface PDFToolbarProps {
  currentTool: ToolType;
  setCurrentTool: (tool: ToolType) => void;
  strokeColor: string;
  setStrokeColor: (color: string) => void;
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  fontFamily: string;
  setFontFamily: (family: string) => void;
  isBold: boolean;
  setIsBold: (bold: boolean) => void;
  isItalic: boolean;
  setIsItalic: (italic: boolean) => void;
  isUnderline: boolean;
  setIsUnderline: (underline: boolean) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onSave: () => void;
  onDownload: () => void;
  onDownloadDocx: () => void;
  onImageUpload: () => void;
  totalPages: number;
  saving: boolean;
  convertingToDocx: boolean;
  readOnly: boolean;
  showColorPicker: boolean;
  setShowColorPicker: (show: boolean) => void;
}

export const PDFToolbar: React.FC<PDFToolbarProps> = ({
  currentTool,
  setCurrentTool,
  strokeColor,
  setStrokeColor,
  strokeWidth,
  setStrokeWidth,
  fontSize,
  setFontSize,
  fontFamily,
  setFontFamily,
  isBold,
  setIsBold,
  isItalic,
  setIsItalic,
  isUnderline,
  setIsUnderline,
  zoom,
  onZoomIn,
  onZoomOut,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDelete,
  onSave,
  onDownload,
  onDownloadDocx,
  onImageUpload,
  totalPages,
  saving,
  convertingToDocx,
  readOnly,
  showColorPicker,
  setShowColorPicker,
}) => {
  const ToolButton = ({ tool, icon: Icon, label }: { tool: ToolType; icon: React.ElementType; label: string }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={currentTool === tool ? 'default' : 'ghost'}
            size="icon"
            onClick={() => setCurrentTool(tool)}
            disabled={readOnly}
            className="h-8 w-8"
          >
            <Icon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 bg-white border-b shadow-sm sticky top-0 z-10">
      {/* Selection Tools */}
      <div className="flex items-center gap-1">
        <ToolButton tool="select" icon={MousePointer2} label="Select (V)" />
        <ToolButton tool="pan" icon={Hand} label="Pan" />
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Drawing Tools */}
      <div className="flex items-center gap-1">
        <ToolButton tool="text" icon={Type} label="Text (T)" />
        <ToolButton tool="draw" icon={Pencil} label="Draw (D)" />
        <ToolButton tool="highlight" icon={Highlighter} label="Highlight (H)" />
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Shape Tools */}
      <div className="flex items-center gap-1">
        <ToolButton tool="rectangle" icon={Square} label="Rectangle (R)" />
        <ToolButton tool="circle" icon={Circle} label="Circle (C)" />
        <ToolButton tool="line" icon={Minus} label="Line (L)" />
        <ToolButton tool="arrow" icon={ArrowRight} label="Arrow (A)" />
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Other Tools */}
      <div className="flex items-center gap-1">
        <ToolButton tool="eraser" icon={Eraser} label="Eraser (E)" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onImageUpload}
                disabled={readOnly}
                className="h-8 w-8"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Insert Image</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Color Picker */}
      <div className="flex items-center gap-2 relative">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="w-6 h-6 rounded border-2 border-gray-300 cursor-pointer hover:border-gray-400 transition-colors"
                style={{ backgroundColor: strokeColor }}
                onClick={() => setShowColorPicker(!showColorPicker)}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>Color</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {showColorPicker && (
          <div 
            className="absolute top-full left-0 mt-1 p-2 bg-white border rounded shadow-lg z-50 grid grid-cols-5 gap-1"
            onMouseLeave={() => setShowColorPicker(false)}
          >
            {COLORS.map(color => (
              <div
                key={color}
                className="w-6 h-6 rounded border cursor-pointer hover:scale-110 transition-transform"
                style={{ backgroundColor: color, borderColor: color === '#ffffff' ? '#ccc' : color }}
                onClick={() => {
                  setStrokeColor(color);
                  setShowColorPicker(false);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Stroke Width */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Width:</span>
        <div className="w-20">
          <Slider
            value={[strokeWidth]}
            onValueChange={([val]) => setStrokeWidth(val)}
            min={1}
            max={20}
            step={1}
            disabled={readOnly}
          />
        </div>
        <span className="text-xs text-gray-500 w-4">{strokeWidth}</span>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Font Controls (shown when text tool is active) */}
      {currentTool === 'text' && (
        <>
          <Select value={fontFamily} onValueChange={setFontFamily}>
            <SelectTrigger className="w-32 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map(font => (
                <SelectItem key={font} value={font}>{font}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={fontSize.toString()} onValueChange={(v) => setFontSize(parseInt(v))}>
            <SelectTrigger className="w-16 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_SIZES.map(size => (
                <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Button
              variant={isBold ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setIsBold(!isBold)}
              className="h-8 w-8"
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              variant={isItalic ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setIsItalic(!isItalic)}
              className="h-8 w-8"
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              variant={isUnderline ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setIsUnderline(!isUnderline)}
              className="h-8 w-8"
            >
              <Underline className="h-4 w-4" />
            </Button>
          </div>

          <Separator orientation="vertical" className="h-6" />
        </>
      )}

      {/* History Controls */}
      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onUndo}
                disabled={!canUndo}
                className="h-8 w-8"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Undo (Ctrl+Z)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onRedo}
                disabled={!canRedo}
                className="h-8 w-8"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Redo (Ctrl+Y)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                disabled={readOnly}
                className="h-8 w-8"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete (Del)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onZoomOut} className="h-8 w-8">
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom Out</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <span className="text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onZoomIn} className="h-8 w-8">
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom In</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Page Info */}
      <span className="text-sm text-gray-500">
        {totalPages} page{totalPages !== 1 ? 's' : ''}
      </span>

      <Separator orientation="vertical" className="h-6" />

      {/* Save Controls */}
      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onSave}
                disabled={saving || readOnly}
                className="h-8 w-8"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Save (Ctrl+S)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDownload}
                disabled={saving}
                className="h-8 w-8"
              >
                <Download className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Download PDF</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDownloadDocx}
                disabled={convertingToDocx}
                className="h-8 w-8"
              >
                {convertingToDocx ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Download as DOCX</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};
