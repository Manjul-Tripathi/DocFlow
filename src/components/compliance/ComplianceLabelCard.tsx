import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Shield,
  Heart,
  CreditCard,
  Building2,
  Lock,
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  Eye,
  FileText,
  Download,
  ShieldCheck,
  CheckCircle2,
  Settings,
  AlertTriangle,
  Globe,
  Key,
  Clock,
  Activity
} from 'lucide-react';
import {
  ComplianceLabel,
  ComplianceFramework,
  COMPLIANCE_FRAMEWORKS,
  DATA_CLASSIFICATION_CONFIG,
  SENSITIVITY_LEVEL_CONFIG
} from '@/types/compliance';

interface ComplianceLabelCardProps {
  label: ComplianceLabel;
  onEdit: (label: ComplianceLabel) => void;
  onDelete: (label: ComplianceLabel) => void;
  onViewDocuments?: (label: ComplianceLabel) => void;
  compact?: boolean;
}

const frameworkIcons: Record<ComplianceFramework, React.ReactNode> = {
  GDPR: <Shield className="h-4 w-4" />,
  HIPAA: <Heart className="h-4 w-4" />,
  SOX: <Building2 className="h-4 w-4" />,
  PCI_DSS: <CreditCard className="h-4 w-4" />,
  CCPA: <Shield className="h-4 w-4" />,
  FERPA: <FileText className="h-4 w-4" />,
  ISO_27001: <Lock className="h-4 w-4" />,
  NIST: <ShieldCheck className="h-4 w-4" />,
  SOC2: <CheckCircle2 className="h-4 w-4" />,
  CUSTOM: <Settings className="h-4 w-4" />
};

export const ComplianceLabelCard: React.FC<ComplianceLabelCardProps> = ({
  label,
  onEdit,
  onDelete,
  onViewDocuments,
  compact = false
}) => {
  const frameworkConfig = COMPLIANCE_FRAMEWORKS[label.framework];
  const classificationConfig = DATA_CLASSIFICATION_CONFIG[label.data_classification];
  const sensitivityConfig = SENSITIVITY_LEVEL_CONFIG[label.sensitivity_level];

  const requirements = [
    { enabled: label.encryption_required, label: 'Encryption', icon: Key },
    { enabled: label.access_logging_required, label: 'Audit Log', icon: Activity },
    { enabled: label.watermark_required, label: 'Watermark', icon: FileText },
    { enabled: label.download_restricted, label: 'Download Restricted', icon: Download },
    { enabled: label.sharing_restricted, label: 'Sharing Restricted', icon: Globe },
    { enabled: label.deletion_requires_approval, label: 'Deletion Approval', icon: AlertTriangle },
  ].filter(r => r.enabled);

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center text-white"
          style={{ backgroundColor: label.color }}
        >
          {frameworkIcons[label.framework]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{label.name}</p>
          <p className="text-xs text-muted-foreground">{label.code}</p>
        </div>
        <Badge variant="outline" className={classificationConfig.color}>
          {classificationConfig.label}
        </Badge>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <div
        className="h-2"
        style={{ backgroundColor: label.color }}
      />
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center text-white"
              style={{ backgroundColor: label.color }}
            >
              {frameworkIcons[label.framework]}
            </div>
            <div>
              <h3 className="font-semibold">{label.name}</h3>
              <p className="text-sm text-muted-foreground">{label.code}</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(label)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Label
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewDocuments?.(label)}>
                <Eye className="h-4 w-4 mr-2" />
                View Documents
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onDelete(label)}
                disabled={label.is_system_label}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {label.description}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <Badge className={frameworkConfig.color + ' text-white'}>
            {frameworkConfig.name}
          </Badge>
          <Badge
            variant="outline"
            className={`${classificationConfig.bgColor} ${classificationConfig.color} ${classificationConfig.borderColor}`}
          >
            {classificationConfig.label}
          </Badge>
          <Badge
            variant="outline"
            className={`${sensitivityConfig.bgColor} ${sensitivityConfig.color}`}
          >
            {sensitivityConfig.label} Sensitivity
          </Badge>
        </div>

        {/* Requirements Icons */}
        <div className="flex items-center gap-1 pt-3 border-t">
          <span className="text-xs text-muted-foreground mr-2">Requirements:</span>
          <TooltipProvider>
            {requirements.slice(0, 5).map((req, index) => (
              <Tooltip key={index}>
                <TooltipTrigger>
                  <div className="h-6 w-6 rounded bg-muted flex items-center justify-center">
                    <req.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{req.label}</p>
                </TooltipContent>
              </Tooltip>
            ))}
            {requirements.length > 5 && (
              <span className="text-xs text-muted-foreground ml-1">
                +{requirements.length - 5} more
              </span>
            )}
          </TooltipProvider>
        </div>

        {label.retention_required && label.retention_period_days && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              Retention: {Math.round(label.retention_period_days / 365)} years
            </span>
          </div>
        )}

        {label.is_system_label && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t">
            <Badge variant="secondary" className="text-xs">
              System Label
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
