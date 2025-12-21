import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import {
  GitCompare,
  Plus,
  Minus,
  ArrowLeftRight,
  Equal,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Sparkles,
  Copy,
  X,
  Maximize2,
  Minimize2,
  Download,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  EyeOff,
  AlignLeft,
  Columns,
  Code,
  FileText,
  Image,
  ArrowUp,
  ArrowDown,
  Check,
  FileCode,
  Highlighter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { VersionComparison, VersionDiff, DocumentVersion } from '@/types/versionControl';

// Helper function for safe date formatting
function formatSafeDate(dateString: string | null | undefined, formatStr: string = 'MMM d, yyyy · HH:mm'): string {
  if (!dateString) return 'Unknown date';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid date';
    return format(date, formatStr);
  } catch {
    return 'Invalid date';
  }
}

// Helper to get created_at from version (handles both created_at and version_created_at)
function getVersionCreatedAt(version: any): string | undefined {
  return version.created_at || version.version_created_at;
}

interface TextDiff {
  type: 'equal' | 'insert' | 'delete';
  value: string;
}

interface EnhancedDiff extends VersionDiff {
  textDiffs?: TextDiff[];
  lineNumber?: number;
}

interface DocumentComparisonViewProps {
  comparison: VersionComparison;
  onClose: () => void;
  onGenerateAISummary?: () => Promise<void>;
  isGeneratingAI?: boolean;
  baseDocumentUrl?: string;
  compareDocumentUrl?: string;
}

// Text diffing algorithm
function computeTextDiff(oldText: string, newText: string): TextDiff[] {
  if (!oldText && !newText) return [];
  if (!oldText) return [{ type: 'insert', value: newText }];
  if (!newText) return [{ type: 'delete', value: oldText }];

  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  const diffs: TextDiff[] = [];

  // Simple LCS-based diff
  const lcs = computeLCS(oldWords, newWords);
  let oldIdx = 0;
  let newIdx = 0;
  let lcsIdx = 0;

  while (oldIdx < oldWords.length || newIdx < newWords.length) {
    if (lcsIdx < lcs.length && oldIdx < oldWords.length && oldWords[oldIdx] === lcs[lcsIdx]) {
      if (newIdx < newWords.length && newWords[newIdx] === lcs[lcsIdx]) {
        diffs.push({ type: 'equal', value: oldWords[oldIdx] });
        oldIdx++;
        newIdx++;
        lcsIdx++;
      } else if (newIdx < newWords.length) {
        diffs.push({ type: 'insert', value: newWords[newIdx] });
        newIdx++;
      }
    } else if (oldIdx < oldWords.length && (lcsIdx >= lcs.length || oldWords[oldIdx] !== lcs[lcsIdx])) {
      diffs.push({ type: 'delete', value: oldWords[oldIdx] });
      oldIdx++;
    } else if (newIdx < newWords.length) {
      diffs.push({ type: 'insert', value: newWords[newIdx] });
      newIdx++;
    } else {
      break;
    }
  }

  return mergeSimilarDiffs(diffs);
}

function computeLCS(arr1: string[], arr2: string[]): string[] {
  const m = arr1.length;
  const n = arr2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const lcs: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (arr1[i - 1] === arr2[j - 1]) {
      lcs.unshift(arr1[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

function mergeSimilarDiffs(diffs: TextDiff[]): TextDiff[] {
  if (diffs.length === 0) return [];

  const merged: TextDiff[] = [diffs[0]];

  for (let i = 1; i < diffs.length; i++) {
    const last = merged[merged.length - 1];
    const current = diffs[i];

    if (last.type === current.type) {
      last.value += current.value;
    } else {
      merged.push(current);
    }
  }

  return merged;
}

export function DocumentComparisonView({
  comparison,
  onClose,
  onGenerateAISummary,
  isGeneratingAI,
  baseDocumentUrl,
  compareDocumentUrl,
}: DocumentComparisonViewProps) {
  const [viewMode, setViewMode] = useState<'unified' | 'split' | 'inline'>('unified');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'added' | 'removed' | 'modified'>('all');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [wordWrap, setWordWrap] = useState(true);
  const [highlightWhitespace, setHighlightWhitespace] = useState(false);
  const [syntaxHighlight, setSyntaxHighlight] = useState(true);
  const [zoom, setZoom] = useState([100]);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const changeRefs = useRef<(HTMLDivElement | null)[]>([]);

  const { baseVersion, compareVersion, diffs, summary, aiSummary } = comparison;

  // Enhanced diffs with text-level diffing
  const enhancedDiffs = useMemo<EnhancedDiff[]>(() => {
    return diffs.map((diff, index) => {
      const enhanced: EnhancedDiff = { ...diff, lineNumber: index + 1 };

      if (diff.type === 'modified' && typeof diff.oldValue === 'string' && typeof diff.newValue === 'string') {
        enhanced.textDiffs = computeTextDiff(diff.oldValue, diff.newValue);
      }

      return enhanced;
    });
  }, [diffs]);

  // Filtered diffs
  const filteredDiffs = useMemo(() => {
    let filtered = enhancedDiffs;

    if (!showUnchanged) {
      filtered = filtered.filter(d => d.type !== 'unchanged');
    }

    if (filter !== 'all') {
      filtered = filtered.filter(d => d.type === filter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(d =>
        d.path.toLowerCase().includes(term) ||
        formatValue(d.oldValue).toLowerCase().includes(term) ||
        formatValue(d.newValue).toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [enhancedDiffs, filter, searchTerm, showUnchanged]);

  // Navigation between changes
  const navigateToChange = useCallback((direction: 'prev' | 'next') => {
    const changesCount = filteredDiffs.length;
    if (changesCount === 0) return;

    let newIndex: number;
    if (direction === 'next') {
      newIndex = (currentChangeIndex + 1) % changesCount;
    } else {
      newIndex = (currentChangeIndex - 1 + changesCount) % changesCount;
    }

    setCurrentChangeIndex(newIndex);
    changeRefs.current[newIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentChangeIndex, filteredDiffs.length]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        navigateToChange('next');
      } else if (e.key === 'ArrowUp' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        navigateToChange('prev');
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          document.exitFullscreen();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateToChange, isFullscreen, onClose]);

  const toggleExpanded = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedPaths(new Set(filteredDiffs.map(d => d.path)));
  };

  const collapseAll = () => {
    setExpandedPaths(new Set());
  };

  const getDiffIcon = (type: VersionDiff['type']) => {
    switch (type) {
      case 'added':
        return <Plus className="h-4 w-4 text-emerald-500" />;
      case 'removed':
        return <Minus className="h-4 w-4 text-red-500" />;
      case 'modified':
        return <ArrowLeftRight className="h-4 w-4 text-amber-500" />;
      case 'unchanged':
        return <Equal className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getDiffColor = (type: VersionDiff['type']) => {
    switch (type) {
      case 'added':
        return 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50';
      case 'removed':
        return 'bg-red-500/10 border-red-500/30 hover:border-red-500/50';
      case 'modified':
        return 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50';
      default:
        return 'bg-muted/50 border-border hover:border-border/80';
    }
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const exportDiffReport = () => {
    const report = {
      generated_at: new Date().toISOString(),
      base_version: `v${baseVersion.major_version}.${baseVersion.minor_version}`,
      compare_version: `v${compareVersion.major_version}.${compareVersion.minor_version}`,
      summary,
      changes: filteredDiffs.map(d => ({
        path: d.path,
        type: d.type,
        oldValue: d.oldValue,
        newValue: d.newValue,
      })),
      ai_summary: aiSummary,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diff-report-v${baseVersion.major_version}.${baseVersion.minor_version}-v${compareVersion.major_version}.${compareVersion.minor_version}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Diff report exported');
  };

  // Render text diff with highlighting
  const renderTextDiff = (textDiffs: TextDiff[]) => {
    return (
      <div className="font-mono text-sm leading-relaxed">
        {textDiffs.map((part, index) => (
          <span
            key={index}
            className={cn(
              'transition-colors',
              part.type === 'insert' && 'bg-emerald-500/30 text-emerald-700 dark:text-emerald-300 px-0.5 rounded',
              part.type === 'delete' && 'bg-red-500/30 text-red-700 dark:text-red-300 line-through px-0.5 rounded',
              part.type === 'equal' && 'text-foreground',
              highlightWhitespace && /^\s+$/.test(part.value) && 'bg-yellow-500/20'
            )}
          >
            {highlightWhitespace ? part.value.replace(/ /g, '·').replace(/\t/g, '→   ') : part.value}
          </span>
        ))}
      </div>
    );
  };

  // Render inline diff view
  const renderInlineDiff = (diff: EnhancedDiff, index: number) => {
    const isActive = index === currentChangeIndex;

    return (
      <div
        ref={el => changeRefs.current[index] = el}
        className={cn(
          'border-l-4 pl-4 py-3 transition-all',
          diff.type === 'added' && 'border-l-emerald-500 bg-emerald-500/5',
          diff.type === 'removed' && 'border-l-red-500 bg-red-500/5',
          diff.type === 'modified' && 'border-l-amber-500 bg-amber-500/5',
          diff.type === 'unchanged' && 'border-l-muted bg-muted/20',
          isActive && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          {showLineNumbers && (
            <span className="text-xs text-muted-foreground font-mono w-8">
              #{diff.lineNumber}
            </span>
          )}
          {getDiffIcon(diff.type)}
          <span className="font-mono text-sm font-medium">{diff.path}</span>
          <Badge variant="outline" className="text-xs capitalize ml-auto">
            {diff.type}
          </Badge>
        </div>

        {diff.textDiffs ? (
          renderTextDiff(diff.textDiffs)
        ) : (
          <div className="space-y-2">
            {diff.type !== 'added' && (
              <div className="flex items-start gap-2">
                <Minus className="h-4 w-4 text-red-500 mt-1 shrink-0" />
                <pre className={cn(
                  'text-sm font-mono bg-red-500/10 px-2 py-1 rounded flex-1',
                  wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'
                )}>
                  {formatValue(diff.oldValue)}
                </pre>
              </div>
            )}
            {diff.type !== 'removed' && (
              <div className="flex items-start gap-2">
                <Plus className="h-4 w-4 text-emerald-500 mt-1 shrink-0" />
                <pre className={cn(
                  'text-sm font-mono bg-emerald-500/10 px-2 py-1 rounded flex-1',
                  wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'
                )}>
                  {formatValue(diff.newValue)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col bg-background border rounded-lg overflow-hidden',
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'h-full'
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <GitCompare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Document Comparison</h3>
              <p className="text-xs text-muted-foreground">
                Comparing {filteredDiffs.length} changes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={exportDiffReport}>
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export Diff Report</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Version indicators */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-muted/50 via-background to-muted/50 border">
          <div className="flex-1 text-center">
            <Badge variant="outline" className="mb-2 bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400">
              Base Version
            </Badge>
            <p className="font-mono text-lg font-bold">
              v{baseVersion.major_version}.{baseVersion.minor_version}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatSafeDate(getVersionCreatedAt(baseVersion))}
            </p>
            {baseVersion.change_summary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                {baseVersion.change_summary}
              </p>
            )}
          </div>

          <div className="flex flex-col items-center gap-1">
            <div className="p-2 rounded-full bg-primary/10">
              <ArrowLeftRight className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground">vs</span>
          </div>

          <div className="flex-1 text-center">
            <Badge variant="outline" className="mb-2 bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
              Compare Version
            </Badge>
            <p className="font-mono text-lg font-bold">
              v{compareVersion.major_version}.{compareVersion.minor_version}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatSafeDate(getVersionCreatedAt(compareVersion))}
            </p>
            {compareVersion.change_summary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                {compareVersion.change_summary}
              </p>
            )}
          </div>
        </div>

        {/* Summary stats */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => setFilter(filter === 'added' ? 'all' : 'added')}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border',
              filter === 'added'
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'hover:bg-muted border-transparent'
            )}
          >
            <Plus className="h-4 w-4" />
            <span className="font-bold">{summary.added}</span>
            <span className="text-muted-foreground">added</span>
          </button>
          <button
            onClick={() => setFilter(filter === 'removed' ? 'all' : 'removed')}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border',
              filter === 'removed'
                ? 'bg-red-500/20 border-red-500/50 text-red-600 dark:text-red-400 shadow-sm'
                : 'hover:bg-muted border-transparent'
            )}
          >
            <Minus className="h-4 w-4" />
            <span className="font-bold">{summary.removed}</span>
            <span className="text-muted-foreground">removed</span>
          </button>
          <button
            onClick={() => setFilter(filter === 'modified' ? 'all' : 'modified')}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border',
              filter === 'modified'
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-600 dark:text-amber-400 shadow-sm'
                : 'hover:bg-muted border-transparent'
            )}
          >
            <ArrowLeftRight className="h-4 w-4" />
            <span className="font-bold">{summary.modified}</span>
            <span className="text-muted-foreground">modified</span>
          </button>
          {summary.unchanged > 0 && (
            <button
              onClick={() => setShowUnchanged(!showUnchanged)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border',
                showUnchanged
                  ? 'bg-muted border-border shadow-sm'
                  : 'hover:bg-muted border-transparent opacity-60'
              )}
            >
              <Equal className="h-4 w-4" />
              <span className="font-bold">{summary.unchanged}</span>
              <span className="text-muted-foreground">unchanged</span>
            </button>
          )}
        </div>
      </div>

      {/* AI Summary */}
      {(aiSummary || onGenerateAISummary) && (
        <div className="px-4 py-3 border-b border-border bg-primary/5">
          {aiSummary ? (
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary mb-1">AI Analysis</p>
                <p className="text-sm text-foreground leading-relaxed">{aiSummary}</p>
              </div>
            </div>
          ) : onGenerateAISummary && (
            <Button
              variant="outline"
              size="sm"
              className="w-full bg-background"
              onClick={onGenerateAISummary}
              disabled={isGeneratingAI}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {isGeneratingAI ? 'Analyzing changes...' : 'Generate AI Summary'}
            </Button>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-4 flex-wrap">
        {/* View mode */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'unified' | 'split' | 'inline')}>
          <TabsList className="h-8">
            <TabsTrigger value="unified" className="text-xs px-3 h-7">
              <AlignLeft className="h-3 w-3 mr-1" />
              Unified
            </TabsTrigger>
            <TabsTrigger value="split" className="text-xs px-3 h-7">
              <Columns className="h-3 w-3 mr-1" />
              Split
            </TabsTrigger>
            <TabsTrigger value="inline" className="text-xs px-3 h-7">
              <Code className="h-3 w-3 mr-1" />
              Inline
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="h-4 w-px bg-border" />

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search changes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Navigation */}
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigateToChange('prev')}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous Change (Ctrl+↑)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="text-xs text-muted-foreground px-2">
            {filteredDiffs.length > 0 ? `${currentChangeIndex + 1} / ${filteredDiffs.length}` : '0 / 0'}
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigateToChange('next')}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next Change (Ctrl+↓)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Options */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="line-numbers"
              checked={showLineNumbers}
              onCheckedChange={setShowLineNumbers}
              className="scale-75"
            />
            <Label htmlFor="line-numbers" className="text-xs cursor-pointer">#</Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="word-wrap"
              checked={wordWrap}
              onCheckedChange={setWordWrap}
              className="scale-75"
            />
            <Label htmlFor="word-wrap" className="text-xs cursor-pointer">Wrap</Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="whitespace"
              checked={highlightWhitespace}
              onCheckedChange={setHighlightWhitespace}
              className="scale-75"
            />
            <Label htmlFor="whitespace" className="text-xs cursor-pointer">
              <Highlighter className="h-3 w-3" />
            </Label>
          </div>
        </div>

        <div className="flex-1" />

        {/* Expand/Collapse */}
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={expandAll}>
          <ChevronDown className="h-3 w-3 mr-1" />
          Expand All
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={collapseAll}>
          <ChevronUp className="h-3 w-3 mr-1" />
          Collapse All
        </Button>
      </div>

      {/* Diff content */}
      <ScrollArea className="flex-1" style={{ fontSize: `${zoom[0]}%` }}>
        <div className="p-4">
          {viewMode === 'inline' ? (
            // Inline view with continuous diff
            <div className="space-y-1 rounded-lg border border-border overflow-hidden">
              {filteredDiffs.map((diff, index) => renderInlineDiff(diff, index))}
            </div>
          ) : viewMode === 'unified' ? (
            // Unified view with collapsible sections
            <div className="space-y-2">
              {filteredDiffs.map((diff, index) => (
                <Collapsible
                  key={`${diff.path}-${index}`}
                  open={expandedPaths.has(diff.path)}
                  onOpenChange={() => toggleExpanded(diff.path)}
                >
                  <div
                    ref={el => changeRefs.current[index] = el}
                    className={cn(
                      'rounded-lg border transition-all',
                      getDiffColor(diff.type),
                      index === currentChangeIndex && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                    )}
                  >
                    <CollapsibleTrigger asChild>
                      <button className="w-full p-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors rounded-t-lg">
                        <div className="flex items-center gap-2">
                          {showLineNumbers && (
                            <span className="text-xs text-muted-foreground font-mono w-6">
                              {diff.lineNumber}
                            </span>
                          )}
                          {expandedPaths.has(diff.path) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        {getDiffIcon(diff.type)}
                        <span className="font-mono text-sm flex-1 truncate">{diff.path}</span>
                        <Badge variant="outline" className="text-xs capitalize shrink-0">
                          {diff.type}
                        </Badge>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-4 pb-4 pt-0 space-y-3">
                        {diff.type === 'modified' && diff.textDiffs ? (
                          <div className="p-3 rounded-lg bg-background border">
                            {renderTextDiff(diff.textDiffs)}
                          </div>
                        ) : diff.type === 'modified' ? (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                                  <Minus className="h-3 w-3" />
                                  Old Value
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => copyToClipboard(formatValue(diff.oldValue))}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                              <pre className={cn(
                                'text-sm font-mono text-foreground/90',
                                wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'
                              )}>
                                {formatValue(diff.oldValue)}
                              </pre>
                            </div>
                            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-emerald-500 font-medium flex items-center gap-1">
                                  <Plus className="h-3 w-3" />
                                  New Value
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => copyToClipboard(formatValue(diff.newValue))}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                              <pre className={cn(
                                'text-sm font-mono text-foreground/90',
                                wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'
                              )}>
                                {formatValue(diff.newValue)}
                              </pre>
                            </div>
                          </div>
                        ) : diff.type === 'added' ? (
                          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-emerald-500 font-medium flex items-center gap-1">
                                <Plus className="h-3 w-3" />
                                Added Value
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => copyToClipboard(formatValue(diff.newValue))}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <pre className={cn(
                              'text-sm font-mono text-foreground/90',
                              wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'
                            )}>
                              {formatValue(diff.newValue)}
                            </pre>
                          </div>
                        ) : diff.type === 'removed' ? (
                          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                                <Minus className="h-3 w-3" />
                                Removed Value
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => copyToClipboard(formatValue(diff.oldValue))}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <pre className={cn(
                              'text-sm font-mono text-foreground/90',
                              wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'
                            )}>
                              {formatValue(diff.oldValue)}
                            </pre>
                          </div>
                        ) : (
                          <div className="p-3 rounded-lg bg-muted/50 border">
                            <pre className={cn(
                              'text-sm font-mono text-muted-foreground',
                              wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'
                            )}>
                              {formatValue(diff.oldValue)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          ) : (
            // Split view
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="sticky top-0 z-10 text-center p-3 bg-red-500/10 rounded-lg border border-red-500/20 backdrop-blur-sm">
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                    v{baseVersion.major_version}.{baseVersion.minor_version}
                  </p>
                  <p className="text-xs text-muted-foreground">Base Version</p>
                </div>
                {filteredDiffs.map((diff, index) => (
                  <div
                    key={`base-${diff.path}-${index}`}
                    ref={el => changeRefs.current[index] = el}
                    className={cn(
                      'p-3 rounded-lg border transition-all',
                      diff.type === 'removed' && 'bg-red-500/10 border-red-500/30',
                      diff.type === 'modified' && 'bg-amber-500/10 border-amber-500/30',
                      diff.type === 'added' && 'opacity-40 bg-muted/30 border-dashed',
                      diff.type === 'unchanged' && 'bg-muted/30 border-border',
                      index === currentChangeIndex && 'ring-2 ring-primary'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {showLineNumbers && (
                        <span className="text-xs text-muted-foreground font-mono">#{diff.lineNumber}</span>
                      )}
                      <p className="font-mono text-xs text-muted-foreground truncate flex-1">{diff.path}</p>
                      {getDiffIcon(diff.type)}
                    </div>
                    <pre className={cn(
                      'text-sm font-mono',
                      wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto',
                      diff.type === 'added' && 'text-muted-foreground italic'
                    )}>
                      {diff.type === 'added' ? '(not present)' : formatValue(diff.oldValue)}
                    </pre>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <div className="sticky top-0 z-10 text-center p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20 backdrop-blur-sm">
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    v{compareVersion.major_version}.{compareVersion.minor_version}
                  </p>
                  <p className="text-xs text-muted-foreground">Compare Version</p>
                </div>
                {filteredDiffs.map((diff, index) => (
                  <div
                    key={`compare-${diff.path}-${index}`}
                    className={cn(
                      'p-3 rounded-lg border transition-all',
                      diff.type === 'added' && 'bg-emerald-500/10 border-emerald-500/30',
                      diff.type === 'modified' && 'bg-amber-500/10 border-amber-500/30',
                      diff.type === 'removed' && 'opacity-40 bg-muted/30 border-dashed',
                      diff.type === 'unchanged' && 'bg-muted/30 border-border',
                      index === currentChangeIndex && 'ring-2 ring-primary'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {showLineNumbers && (
                        <span className="text-xs text-muted-foreground font-mono">#{diff.lineNumber}</span>
                      )}
                      <p className="font-mono text-xs text-muted-foreground truncate flex-1">{diff.path}</p>
                      {getDiffIcon(diff.type)}
                    </div>
                    <pre className={cn(
                      'text-sm font-mono',
                      wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto',
                      diff.type === 'removed' && 'text-muted-foreground italic'
                    )}>
                      {diff.type === 'removed' ? '(removed)' : formatValue(diff.newValue)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredDiffs.length === 0 && (
            <div className="text-center py-16">
              <div className="inline-flex p-4 rounded-full bg-muted mb-4">
                <Equal className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium text-foreground">No changes found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {filter !== 'all'
                  ? `No ${filter} changes to display. Try a different filter.`
                  : searchTerm
                    ? 'Try a different search term.'
                    : 'The versions are identical.'}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer with keyboard shortcuts */}
      <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px]">Ctrl</kbd>
            <span className="mx-1">+</span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px]">↑↓</kbd>
            <span className="ml-1">Navigate</span>
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px]">Esc</kbd>
            <span className="ml-1">Close</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span>Zoom:</span>
          <Slider
            value={zoom}
            onValueChange={setZoom}
            min={50}
            max={150}
            step={10}
            className="w-24"
          />
          <span>{zoom}%</span>
        </div>
      </div>
    </div>
  );
}
