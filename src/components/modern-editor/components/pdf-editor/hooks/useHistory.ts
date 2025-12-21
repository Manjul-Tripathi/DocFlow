import { useCallback, useRef, useState } from 'react';
import { HistoryState, PageCanvas } from '../types';

export function useHistory() {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const historyRef = useRef<HistoryState[]>([]);
  const historyIndexRef = useRef(-1);

  const saveToHistory = useCallback((canvas: fabric.Canvas, pageCanvases: PageCanvas[]) => {
    const pageCanvas = pageCanvases.find(pc => pc.fabricCanvas === canvas);
    if (!pageCanvas) return;

    const json = JSON.stringify(canvas.toJSON());
    const newState: HistoryState = {
      pageNum: pageCanvas.pageNum,
      json,
    };

    // Remove any future history if we're not at the end
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(newState);
    historyIndexRef.current = historyRef.current.length - 1;
    
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  const undo = useCallback((pageCanvases: PageCanvas[]) => {
    if (historyIndexRef.current <= 0) return;

    historyIndexRef.current--;
    const state = historyRef.current[historyIndexRef.current];
    
    const pageCanvas = pageCanvases.find(pc => pc.pageNum === state.pageNum);
    if (pageCanvas) {
      pageCanvas.fabricCanvas.loadFromJSON(JSON.parse(state.json), () => {
        pageCanvas.fabricCanvas.renderAll();
      });
    }
    
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  const redo = useCallback((pageCanvases: PageCanvas[]) => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;

    historyIndexRef.current++;
    const state = historyRef.current[historyIndexRef.current];
    
    const pageCanvas = pageCanvases.find(pc => pc.pageNum === state.pageNum);
    if (pageCanvas) {
      pageCanvas.fabricCanvas.loadFromJSON(JSON.parse(state.json), () => {
        pageCanvas.fabricCanvas.renderAll();
      });
    }
    
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    historyIndexRef.current = -1;
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  return {
    canUndo,
    canRedo,
    saveToHistory,
    undo,
    redo,
    clearHistory,
  };
}
