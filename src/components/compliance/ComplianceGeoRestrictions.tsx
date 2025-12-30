import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Globe,
  MapPin,
  Shield,
  AlertTriangle,
  Plus,
  Trash2,
  Edit,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  Flag,
  Settings,
  MoreVertical,
  Info,
  Ban
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useComplianceLabels } from '@/hooks/useComplianceLabels';
import { COMPLIANCE_FRAMEWORKS } from '@/types/compliance';
import { toast } from 'sonner';

interface GeoRestriction {
  id: string;
  name: string;
  description?: string;
  label_ids: string[];
  restriction_type: 'allow' | 'deny';
  countries: string[];
  regions?: string[];
  is_active: boolean;
  enforcement_action: 'block' | 'warn' | 'log';
  created_at: string;
  updated_at: string;
  violations_count: number;
}

interface Country {
  code: string;
  name: string;
  region: string;
}

const countries: Country[] = [
  { code: 'US', name: 'United States', region: 'North America' },
  { code: 'CA', name: 'Canada', region: 'North America' },
  { code: 'MX', name: 'Mexico', region: 'North America' },
  { code: 'GB', name: 'United Kingdom', region: 'Europe' },
  { code: 'DE', name: 'Germany', region: 'Europe' },
  { code: 'FR', name: 'France', region: 'Europe' },
  { code: 'ES', name: 'Spain', region: 'Europe' },
  { code: 'IT', name: 'Italy', region: 'Europe' },
  { code: 'NL', name: 'Netherlands', region: 'Europe' },
  { code: 'BE', name: 'Belgium', region: 'Europe' },
  { code: 'AT', name: 'Austria', region: 'Europe' },
  { code: 'CH', name: 'Switzerland', region: 'Europe' },
  { code: 'PL', name: 'Poland', region: 'Europe' },
  { code: 'SE', name: 'Sweden', region: 'Europe' },
  { code: 'NO', name: 'Norway', region: 'Europe' },
  { code: 'DK', name: 'Denmark', region: 'Europe' },
  { code: 'FI', name: 'Finland', region: 'Europe' },
  { code: 'IE', name: 'Ireland', region: 'Europe' },
  { code: 'PT', name: 'Portugal', region: 'Europe' },
  { code: 'AU', name: 'Australia', region: 'Asia Pacific' },
  { code: 'NZ', name: 'New Zealand', region: 'Asia Pacific' },
  { code: 'JP', name: 'Japan', region: 'Asia Pacific' },
  { code: 'KR', name: 'South Korea', region: 'Asia Pacific' },
  { code: 'SG', name: 'Singapore', region: 'Asia Pacific' },
  { code: 'HK', name: 'Hong Kong', region: 'Asia Pacific' },
  { code: 'CN', name: 'China', region: 'Asia Pacific' },
  { code: 'IN', name: 'India', region: 'Asia Pacific' },
  { code: 'BR', name: 'Brazil', region: 'South America' },
  { code: 'AR', name: 'Argentina', region: 'South America' },
  { code: 'ZA', name: 'South Africa', region: 'Africa' },
  { code: 'AE', name: 'United Arab Emirates', region: 'Middle East' },
  { code: 'SA', name: 'Saudi Arabia', region: 'Middle East' },
  { code: 'IL', name: 'Israel', region: 'Middle East' },
  { code: 'RU', name: 'Russia', region: 'Europe' }
];

const regions = ['North America', 'Europe', 'Asia Pacific', 'South America', 'Africa', 'Middle East'];

const euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];

export const ComplianceGeoRestrictions: React.FC = () => {
  const { labels } = useComplianceLabels();
  const [restrictions, setRestrictions] = useState<GeoRestriction[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedRestriction, setSelectedRestriction] = useState<GeoRestriction | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<GeoRestriction>>({
    name: '',
    description: '',
    restriction_type: 'deny',
    label_ids: [],
    countries: [],
    enforcement_action: 'block',
    is_active: true
  });

  // Initialize mock data
  useEffect(() => {
    const mockRestrictions: GeoRestriction[] = [
      {
        id: '1',
        name: 'GDPR Data - EU Only',
        description: 'GDPR-labeled documents can only be accessed from EU countries',
        label_ids: ['1'],
        restriction_type: 'allow',
        countries: euCountries,
        is_active: true,
        enforcement_action: 'block',
        created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
        updated_at: new Date(Date.now() - 86400000 * 5).toISOString(),
        violations_count: 12
      },
      {
        id: '2',
        name: 'Block High-Risk Countries',
        description: 'Block access to sensitive documents from high-risk regions',
        label_ids: ['2', '3', '4'],
        restriction_type: 'deny',
        countries: ['RU', 'CN', 'KR'],
        is_active: true,
        enforcement_action: 'block',
        created_at: new Date(Date.now() - 86400000 * 60).toISOString(),
        updated_at: new Date(Date.now() - 86400000 * 10).toISOString(),
        violations_count: 45
      },
      {
        id: '3',
        name: 'HIPAA - US Only',
        description: 'HIPAA-protected health data restricted to US access',
        label_ids: ['2'],
        restriction_type: 'allow',
        countries: ['US'],
        is_active: true,
        enforcement_action: 'block',
        created_at: new Date(Date.now() - 86400000 * 45).toISOString(),
        updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        violations_count: 8
      },
      {
        id: '4',
        name: 'Financial Data - Warn Mode',
        description: 'Warn but allow access to financial documents from outside approved regions',
        label_ids: ['4'],
        restriction_type: 'allow',
        countries: ['US', 'GB', 'DE', 'JP'],
        is_active: false,
        enforcement_action: 'warn',
        created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
        updated_at: new Date(Date.now() - 86400000 * 7).toISOString(),
        violations_count: 23
      }
    ];
    setRestrictions(mockRestrictions);
  }, []);

  const handleCreateRestriction = async () => {
    setIsLoading(true);
    try {
      const newRestriction: GeoRestriction = {
        ...formData as GeoRestriction,
        id: `geo-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        violations_count: 0
      };
      
      setRestrictions(prev => [...prev, newRestriction]);
      setIsCreateDialogOpen(false);
      resetForm();
      toast.success('Geo-restriction created');
    } catch (error) {
      toast.error('Failed to create restriction');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateRestriction = async () => {
    if (!selectedRestriction) return;
    setIsLoading(true);
    try {
      setRestrictions(prev => prev.map(r => 
        r.id === selectedRestriction.id 
          ? { ...r, ...formData, updated_at: new Date().toISOString() }
          : r
      ));
      setIsEditDialogOpen(false);
      setSelectedRestriction(null);
      resetForm();
      toast.success('Restriction updated');
    } catch (error) {
      toast.error('Failed to update restriction');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRestriction = async () => {
    if (!selectedRestriction) return;
    setRestrictions(prev => prev.filter(r => r.id !== selectedRestriction.id));
    setShowDeleteConfirm(false);
    setSelectedRestriction(null);
    toast.success('Restriction deleted');
  };

  const handleToggleRestriction = (restriction: GeoRestriction) => {
    setRestrictions(prev => prev.map(r => 
      r.id === restriction.id 
        ? { ...r, is_active: !r.is_active, updated_at: new Date().toISOString() }
        : r
    ));
    toast.success(restriction.is_active ? 'Restriction disabled' : 'Restriction enabled');
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      restriction_type: 'deny',
      label_ids: [],
      countries: [],
      enforcement_action: 'block',
      is_active: true
    });
  };

  const openEditDialog = (restriction: GeoRestriction) => {
    setSelectedRestriction(restriction);
    setFormData({
      name: restriction.name,
      description: restriction.description,
      restriction_type: restriction.restriction_type,
      label_ids: restriction.label_ids,
      countries: restriction.countries,
      enforcement_action: restriction.enforcement_action,
      is_active: restriction.is_active
    });
    setIsEditDialogOpen(true);
  };

  const handleCountryToggle = (countryCode: string) => {
    setFormData(prev => ({
      ...prev,
      countries: prev.countries?.includes(countryCode)
        ? prev.countries.filter(c => c !== countryCode)
        : [...(prev.countries || []), countryCode]
    }));
  };

  const handleSelectRegion = (region: string) => {
    const regionCountries = countries.filter(c => c.region === region).map(c => c.code);
    const allSelected = regionCountries.every(c => formData.countries?.includes(c));
    
    setFormData(prev => ({
      ...prev,
      countries: allSelected
        ? prev.countries?.filter(c => !regionCountries.includes(c)) || []
        : [...new Set([...(prev.countries || []), ...regionCountries])]
    }));
  };

  const handleSelectEU = () => {
    const allSelected = euCountries.every(c => formData.countries?.includes(c));
    setFormData(prev => ({
      ...prev,
      countries: allSelected
        ? prev.countries?.filter(c => !euCountries.includes(c)) || []
        : [...new Set([...(prev.countries || []), ...euCountries])]
    }));
  };

  const getLabelName = (labelId: string) => {
    const label = labels.find(l => l.id === labelId);
    return label?.name || 'Unknown Label';
  };

  const getLabelColor = (labelId: string) => {
    const label = labels.find(l => l.id === labelId);
    return label?.color || '#6B7280';
  };

  const getCountryName = (code: string) => {
    return countries.find(c => c.code === code)?.name || code;
  };

  const activeRestrictions = restrictions.filter(r => r.is_active);
  const totalViolations = restrictions.reduce((sum, r) => sum + r.violations_count, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Geographic Restrictions
          </h2>
          <p className="text-sm text-muted-foreground">
            Control document access based on geographic location
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Restriction
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeRestrictions.length}</p>
                <p className="text-xs text-muted-foreground">Active Restrictions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <Ban className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">{totalViolations}</p>
                <p className="text-xs text-muted-foreground">Total Violations</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {new Set(restrictions.flatMap(r => r.countries)).size}
                </p>
                <p className="text-xs text-muted-foreground">Countries Configured</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Restrictions List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Restriction Rules</CardTitle>
          <CardDescription>
            Define geographic access controls for compliance-labeled documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[450px]">
            {restrictions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Globe className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No geo-restrictions</h3>
                <p className="text-muted-foreground mb-4">
                  Create restrictions to control geographic access
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Restriction
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {restrictions.map((restriction) => (
                  <div
                    key={restriction.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      restriction.is_active ? 'bg-card' : 'bg-muted/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                          restriction.restriction_type === 'allow' 
                            ? 'bg-green-500/10 text-green-500'
                            : 'bg-red-500/10 text-red-500'
                        }`}>
                          {restriction.restriction_type === 'allow' 
                            ? <Unlock className="h-5 w-5" />
                            : <Lock className="h-5 w-5" />
                          }
                        </div>
                        
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium">{restriction.name}</h4>
                            <Badge variant={restriction.restriction_type === 'allow' ? 'default' : 'destructive'}>
                              {restriction.restriction_type === 'allow' ? 'Allow List' : 'Block List'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {restriction.enforcement_action}
                            </Badge>
                            {!restriction.is_active && (
                              <Badge variant="secondary" className="text-xs">
                                Disabled
                              </Badge>
                            )}
                          </div>
                          
                          {restriction.description && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {restriction.description}
                            </p>
                          )}
                          
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {restriction.label_ids.map(labelId => (
                              <Badge
                                key={labelId}
                                style={{ backgroundColor: getLabelColor(labelId) }}
                                className="text-white text-xs"
                              >
                                {getLabelName(labelId)}
                              </Badge>
                            ))}
                          </div>
                          
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {restriction.countries.slice(0, 8).map(code => (
                              <Badge key={code} variant="outline" className="text-xs">
                                <Flag className="h-3 w-3 mr-1" />
                                {code}
                              </Badge>
                            ))}
                            {restriction.countries.length > 8 && (
                              <Badge variant="outline" className="text-xs">
                                +{restriction.countries.length - 8} more
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{restriction.violations_count} violations recorded</span>
                            <span>Updated: {new Date(restriction.updated_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={restriction.is_active}
                          onCheckedChange={() => handleToggleRestriction(restriction)}
                        />
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(restriction)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setSelectedRestriction(restriction);
                                setShowDeleteConfirm(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog 
        open={isCreateDialogOpen || isEditDialogOpen} 
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setIsEditDialogOpen(false);
            setSelectedRestriction(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {isEditDialogOpen ? 'Edit Geo-Restriction' : 'Create Geo-Restriction'}
            </DialogTitle>
            <DialogDescription>
              Define geographic access rules for compliance-labeled documents
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 py-4 pr-4">
              <div className="space-y-2">
                <Label>Rule Name</Label>
                <Input
                  value={formData.name || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., GDPR Data - EU Only"
                />
              </div>

              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input
                  value={formData.description || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe this restriction..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Restriction Type</Label>
                  <Select
                    value={formData.restriction_type}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, restriction_type: v as 'allow' | 'deny' }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="allow">
                        <div className="flex items-center gap-2">
                          <Unlock className="h-4 w-4 text-green-500" />
                          Allow List (Whitelist)
                        </div>
                      </SelectItem>
                      <SelectItem value="deny">
                        <div className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-red-500" />
                          Block List (Blacklist)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Enforcement Action</Label>
                  <Select
                    value={formData.enforcement_action}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, enforcement_action: v as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="block">Block Access</SelectItem>
                      <SelectItem value="warn">Warn User</SelectItem>
                      <SelectItem value="log">Log Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Apply to Labels</Label>
                <Select
                  value={formData.label_ids?.[0] || ''}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, label_ids: [v] }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a label" />
                  </SelectTrigger>
                  <SelectContent>
                    {labels.map((label) => (
                      <SelectItem key={label.id} value={label.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: label.color }}
                          />
                          <span>{label.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Countries</Label>
                
                <div className="flex flex-wrap gap-2 mb-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={handleSelectEU}
                  >
                    EU Countries
                  </Button>
                  {regions.map(region => (
                    <Button
                      key={region}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectRegion(region)}
                    >
                      {region}
                    </Button>
                  ))}
                </div>

                <div className="p-3 rounded-lg border bg-muted/30 max-h-48 overflow-y-auto">
                  <div className="grid grid-cols-3 gap-2">
                    {countries.map(country => (
                      <div key={country.code} className="flex items-center gap-2">
                        <Checkbox
                          id={country.code}
                          checked={formData.countries?.includes(country.code)}
                          onCheckedChange={() => handleCountryToggle(country.code)}
                        />
                        <label htmlFor={country.code} className="text-sm cursor-pointer">
                          {country.code} - {country.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  {formData.countries?.length || 0} countries selected
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <span className="text-sm font-medium">Enable Restriction</span>
                  <p className="text-xs text-muted-foreground">Start enforcing this rule immediately</p>
                </div>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                />
              </div>

              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    {formData.restriction_type === 'allow' 
                      ? 'Only users from selected countries will be able to access documents with the specified labels.'
                      : 'Users from selected countries will be blocked from accessing documents with the specified labels.'
                    }
                  </p>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsCreateDialogOpen(false);
                setIsEditDialogOpen(false);
                setSelectedRestriction(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={isEditDialogOpen ? handleUpdateRestriction : handleCreateRestriction}
              disabled={!formData.name || !formData.countries?.length || !formData.label_ids?.length || isLoading}
            >
              {isEditDialogOpen ? 'Save Changes' : 'Create Restriction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Geo-Restriction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{selectedRestriction?.name}". 
              Documents will no longer be protected by this geographic restriction.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRestriction}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Restriction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
