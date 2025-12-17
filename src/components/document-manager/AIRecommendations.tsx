import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Lightbulb, 
  Sparkles, 
  AlertTriangle, 
  TrendingUp, 
  Clock,
  FileText,
  Tag,
  ArrowRight,
  Star,
  Brain,
  Loader2
} from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/config/api";

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  created_at: string;
  insights?: DocumentInsight;
  tags?: DocumentTag[];
  is_deleted?: boolean;
}

interface DocumentInsight {
  summary: string;
  key_topics: string[];
  importance_score: number;
  estimated_reading_time: number;
  ai_generated_title: string;
  suggested_actions: string[];
}

interface DocumentTag {
  id: string;
  name: string;
  is_ai_suggested: boolean;
  confidence_score: number;
}

interface AIRecommendationsProps {
  documents: Document[];
  onRefresh?: () => void;
}

interface Recommendation {
  type: 'action' | 'insight' | 'suggestion' | 'warning';
  title: string;
  description: string;
  action?: string;
  actionHandler?: () => Promise<void>;
  priority: 'high' | 'medium' | 'low';
  icon: React.ReactNode;
  documents?: Document[];
}

export const AIRecommendations: React.FC<AIRecommendationsProps> = ({ documents, onRefresh }) => {
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const { toast } = useToast();

  const handleProcessPending = async (documentIds: string[]) => {
    try {
      setProcessingAction('Process Now');
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast({
          title: "Error",
          description: "Please log in to process documents",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/process-pending-documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.user.id,
          documentIds: documentIds
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to process documents');
      }

      const result = await response.json() as { message?: string; processedCount?: number };

      toast({
        title: "Documents Processed",
        description: result.message || `Processed ${result.processedCount || 0} documents`,
      });

      // Refresh the documents list
      if (onRefresh) {
        onRefresh();
      }

    } catch (error) {
      console.error('Error processing documents:', error);
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : "Failed to process documents",
        variant: "destructive",
      });
    } finally {
      setProcessingAction(null);
    }
  };

  const handleAutoOrganize = async () => {
    try {
      setProcessingAction('Auto-Organize');
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast({
          title: "Error",
          description: "Please log in to organize documents",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/auto-organize-documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.user.id
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to organize documents');
      }

      const result = await response.json() as { message?: string; documentsOrganized?: number };

      toast({
        title: "Documents Organized",
        description: result.message || `Organized ${result.documentsOrganized || 0} documents`,
      });

      // Refresh the page to show updated folders
      window.location.reload();

    } catch (error) {
      console.error('Error organizing documents:', error);
      toast({
        title: "Organization Failed",
        description: error instanceof Error ? error.message : "Failed to organize documents",
        variant: "destructive",
      });
    } finally {
      setProcessingAction(null);
    }
  };

  const generateRecommendations = (): Recommendation[] => {
    const recommendations: Recommendation[] = [];

    // Find high importance documents without proper tags
    const highImportanceUntagged = documents.filter(doc => 
      (doc.insights?.importance_score || 0) >= 0.8 && 
      (!doc.tags || doc.tags.length === 0)
    );

    if (highImportanceUntagged.length > 0) {
      recommendations.push({
        type: 'action',
        title: 'Tag Important Documents',
        description: `${highImportanceUntagged.length} high-priority documents need tags for better organization`,
        action: 'Add Tags',
        priority: 'high',
        icon: <Tag className="w-4 h-4 text-orange-500" />,
        documents: highImportanceUntagged
      });
    }

    // Find documents with long reading times
    const longReadingDocs = documents.filter(doc => 
      (doc.insights?.estimated_reading_time || 0) > 30
    );

    if (longReadingDocs.length > 0) {
      recommendations.push({
        type: 'insight',
        title: 'Long Documents Detected',
        description: `${longReadingDocs.length} documents have reading times over 30 minutes`,
        action: 'Create Summaries',
        priority: 'medium',
        icon: <Clock className="w-4 h-4 text-blue-500" />,
        documents: longReadingDocs
      });
    }

    // Find similar documents that could be grouped
    const documentsByTopic: { [key: string]: Document[] } = {};
    documents.forEach(doc => {
      doc.insights?.key_topics?.forEach(topic => {
        if (!documentsByTopic[topic]) {
          documentsByTopic[topic] = [];
        }
        documentsByTopic[topic].push(doc);
      });
    });

    const duplicateTopics = Object.entries(documentsByTopic)
      .filter(([topic, docs]) => docs.length >= 3)
      .slice(0, 2);

    duplicateTopics.forEach(([topic, docs]) => {
      recommendations.push({
        type: 'suggestion',
        title: `Group ${topic} Documents`,
        description: `${docs.length} documents share the topic "${topic}" - consider creating a smart folder`,
        action: 'Create Folder',
        priority: 'medium',
        icon: <TrendingUp className="w-4 h-4 text-green-500" />,
        documents: docs
      });
    });

    // Find documents with many suggested actions
    const actionableDocs = documents.filter(doc => 
      (doc.insights?.suggested_actions?.length || 0) > 2
    );

    if (actionableDocs.length > 0) {
      recommendations.push({
        type: 'action',
        title: 'Review Action Items',
        description: `${actionableDocs.length} documents have multiple AI-suggested actions`,
        action: 'Review Actions',
        priority: 'medium',
        icon: <Lightbulb className="w-4 h-4 text-yellow-500" />,
        documents: actionableDocs
      });
    }

    // Find recently uploaded documents without AI analysis
    const recentUnanalyzed = documents.filter(doc => {
      const daysSinceUpload = (Date.now() - new Date(doc.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceUpload <= 7 && !doc.insights && !doc.is_deleted;
    });

    if (recentUnanalyzed.length > 0) {
      recommendations.push({
        type: 'warning',
        title: 'Pending AI Analysis',
        description: `${recentUnanalyzed.length} recent documents haven't been processed by AI yet`,
        action: 'Process Now',
        priority: 'high',
        icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
        documents: recentUnanalyzed,
        actionHandler: () => handleProcessPending(recentUnanalyzed.map(d => d.id))
      });
    }

    // General organization suggestion if many documents
    if (documents.length > 20) {
      const unorganizedDocs = documents.filter(doc => 
        (!doc.tags || doc.tags.length === 0) && !doc.insights
      );

      if (unorganizedDocs.length > 5) {
        recommendations.push({
          type: 'suggestion',
          title: 'Improve Organization',
          description: 'Many documents could benefit from AI-powered auto-organization',
          action: 'Auto-Organize',
          priority: 'low',
          icon: <Brain className="w-4 h-4 text-purple-500" />,
          actionHandler: () => handleAutoOrganize()
        });
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  };

  const recommendations = generateRecommendations();

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950';
      case 'medium': return 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950';
      case 'low': return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950';
      default: return 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950';
    }
  };

  const getPriorityBadgeColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'secondary';
    }
  };

  if (recommendations.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <Sparkles className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            All Set!
          </p>
          <p className="text-xs text-muted-foreground">
            Your documents are well organized
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">AI Recommendations</h3>
      </div>

      <div className="space-y-3">
        {recommendations.slice(0, 4).map((rec, index) => (
          <Card 
            key={index} 
            className={`${getPriorityColor(rec.priority)} border transition-all hover:shadow-md`}
          >
            <CardContent className="p-3">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {rec.icon}
                  <span className="font-medium text-sm">{rec.title}</span>
                </div>
                <Badge 
                  variant={getPriorityBadgeColor(rec.priority)} 
                  className="text-xs"
                >
                  {rec.priority}
                </Badge>
              </div>
              
              <p className="text-xs text-muted-foreground mb-3">
                {rec.description}
              </p>

              {rec.documents && rec.documents.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium mb-1">Affected Documents:</p>
                  <div className="space-y-1">
                    {rec.documents.slice(0, 2).map(doc => (
                      <div key={doc.id} className="flex items-center gap-2">
                        <FileText className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs truncate">
                          {doc.insights?.ai_generated_title || doc.file_name}
                        </span>
                      </div>
                    ))}
                    {rec.documents.length > 2 && (
                      <p className="text-xs text-muted-foreground">
                        +{rec.documents.length - 2} more documents
                      </p>
                    )}
                  </div>
                </div>
              )}

              {rec.action && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full justify-between text-xs h-7"
                  onClick={() => rec.actionHandler?.()}
                  disabled={processingAction !== null}
                >
                  {processingAction === rec.action ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      Processing...
                    </>
                  ) : (
                    <>
                      {rec.action}
                      <ArrowRight className="w-3 h-3" />
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {recommendations.length > 4 && (
        <Card className="border-dashed">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-2">
              {recommendations.length - 4} more recommendations available
            </p>
            <Button variant="ghost" size="sm" className="text-xs">
              View All Recommendations
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};