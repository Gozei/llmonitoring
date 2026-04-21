/**
 * 提供商管理对话框组件
 */

'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Loader2,
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  Globe,
  Box,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import {
  useCreatePlatform,
  useUpdatePlatform,
  useDeletePlatform,
  useCreateModel,
  useUpdateModel,
  useDeleteModel,
  useModels,
  usePlatforms,
} from './use-api';
import type { Platform, Model } from './types';
import {
  DEFAULT_PROVIDER_PROTOCOL,
  PROTOCOL_TEMPLATES,
  resolveProtocolEndpoint,
  resolveProviderProtocol,
  type ProviderProtocol,
  withProviderProtocol,
} from '@/lib/monitoring/protocols';

interface ModelFormData {
  id?: number;
  name: string;
  model_id: string;
  description: string;
  protocol: ProviderProtocol;
  is_active: boolean;
  _isNew?: boolean;
  _isEditing?: boolean;
}

interface PlatformManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform?: Platform | null;
  onSuccess?: () => void;
  mode?: 'create' | 'edit';
}

function buildPlatformConfig(existingConfig: Record<string, unknown> | undefined) {
  return {
    ...(existingConfig || {}),
    timeout: 60000,
  };
}

function buildSupplierSlug(name: string, endpoint: string): string {
  const base = (name || endpoint || 'supplier')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return base || 'supplier';
}

export function PlatformManagementDialog({
  open,
  onOpenChange,
  platform,
  onSuccess,
  mode: initialMode,
}: PlatformManagementDialogProps) {
  // 模式：create 分步创建，edit 标签页切换
  const isEditing = !!platform;
  const mode = initialMode || (isEditing ? 'edit' : 'create');

  // 创建流程状态
  const [step, setStep] = useState<'select' | 'platform' | 'models'>('select');
  const [activeTab, setActiveTab] = useState('platform');

  // 平台表单数据
  const [platformData, setPlatformData] = useState({
    name: '',
    slug: '',
    description: '',
    api_endpoint: '',
    api_key: '',
    is_active: true,
  });

  // 模型列表
  const [models, setModels] = useState<ModelFormData[]>([]);
  const [currentPlatformId, setCurrentPlatformId] = useState<number | null>(null);
  const [savingModels, setSavingModels] = useState<Set<number>>(new Set());
  const [deletingModelId, setDeletingModelId] = useState<number | null>(null);
  const [confirmDeleteModel, setConfirmDeleteModel] = useState<ModelFormData | null>(null);
  const [confirmDeletePlatformOpen, setConfirmDeletePlatformOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Hooks
  const { create, loading: creating } = useCreatePlatform();
  const { update, loading: updating } = useUpdatePlatform();
  const { remove, loading: deleting } = useDeletePlatform();
  const { create: createModel, loading: creatingModel } = useCreateModel();
  const { update: updateModel, loading: updatingModel } = useUpdateModel();
  const { remove: deleteModel, loading: deletingModel } = useDeleteModel();
  const { models: fetchedModels, fetch: fetchModels, loading: fetchingModels } = useModels();
  const { platforms, fetch: fetchPlatforms } = usePlatforms();

  const loading = creating || updating || deleting || creatingModel || updatingModel || deletingModel;
  const isModelLoading = fetchingModels || savingModels.size > 0 || deletingModelId !== null;

  // 加载平台列表
  useEffect(() => {
    if (open) {
      setMessage(null);
      setConfirmDeleteModel(null);
      setConfirmDeletePlatformOpen(false);
      fetchPlatforms();
    }
  }, [open, fetchPlatforms]);

  // 初始化表单数据
  useEffect(() => {
    if (platform && open) {
      setPlatformData({
        name: platform.name || '',
        slug: platform.slug || '',
        description: platform.description || '',
        api_endpoint: platform.api_endpoint || '',
        api_key: platform.api_key || '',
        is_active: platform.is_active ?? true,
      });
      // 编辑模式：加载现有模型
      if (mode === 'edit' && platform.id) {
        fetchModels(platform.id);
      } else {
        setModels(
          platform.models?.map((m) => ({
            id: m.id,
            name: m.name,
            model_id: m.model_id,
            description: m.description || '',
            protocol: resolveProviderProtocol(m.config),
            is_active: m.is_active,
          })) || []
        );
      }
      setCurrentPlatformId(platform.id);
      setStep('platform');
      setActiveTab('platform');
    } else if (open) {
      // 添加模式
      setPlatformData({
        name: '',
        slug: '',
        description: '',
        api_endpoint: '',
        api_key: '',
        is_active: true,
      });
      setModels([]);
      setCurrentPlatformId(null);
      setStep('select');
      setActiveTab('platform');
    }
  }, [platform, open, mode, fetchModels]);

  // 同步模型数据
  useEffect(() => {
    if (mode === 'edit' && fetchedModels) {
      setModels(
        (fetchedModels as Model[]).map((m) => ({
          id: m.id,
          name: m.name || '',
          model_id: m.model_id || '',
          description: m.description || '',
          protocol: resolveProviderProtocol(m.config),
          is_active: m.is_active ?? true,
          _isNew: false,
          _isEditing: false,
        }))
      );
    }
  }, [fetchedModels, mode]);

  // 选择首个模型协议模板
  const handleProtocolTemplateSelect = (protocol: ProviderProtocol) => {
    setModels([
      {
        name: '',
        model_id: '',
        description: '',
        protocol,
        is_active: true,
        _isNew: true,
        _isEditing: true,
      },
    ]);
    setStep('platform');
    setActiveTab('platform');
  };

  // 添加模型
  const handleAddModel = (protocol: ProviderProtocol = DEFAULT_PROVIDER_PROTOCOL) => {
    setModels((prev) => [
      ...prev,
      {
        name: '',
        model_id: '',
        description: '',
        protocol,
        is_active: true,
        _isNew: true,
        _isEditing: true,
      },
    ]);
    setActiveTab('models');
  };

  // 切换编辑状态
  const toggleEdit = (index: number) => {
    setModels((prev) =>
      prev.map((m, i) => (i === index ? { ...m, _isEditing: !m._isEditing } : m))
    );
  };

  // 取消编辑
  const cancelEdit = (index: number) => {
    const original = (fetchedModels as Model[] | undefined)?.find(
      (m) => m.id === models[index].id
    );
    if (original || models[index]._isNew) {
      if (models[index]._isNew) {
        setModels((prev) => prev.filter((_, i) => i !== index));
      } else if (original) {
        setModels((prev) =>
          prev.map((m, i) =>
            i === index
              ? {
                  id: original.id,
                  name: original.name || '',
                  model_id: original.model_id || '',
                  description: original.description || '',
                  protocol: resolveProviderProtocol(original.config),
                  is_active: original.is_active ?? true,
                  _isNew: false,
                  _isEditing: false,
                }
              : m
          )
        );
      }
    }
  };

  // 更新模型字段
  const handleModelChange = (index: number, field: keyof ModelFormData, value: unknown) => {
    setModels((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  };

  // 删除模型
  const handleDeleteModel = async (model: ModelFormData, index: number) => {
    if (!model.id) {
      setModels((prev) => prev.filter((_, i) => i !== index));
      return;
    }

    setMessage(null);
    setDeletingModelId(model.id);
    try {
      await deleteModel(model.id);
      if (currentPlatformId || platform?.id) {
        await fetchModels(currentPlatformId || (platform?.id as number));
      } else {
        setModels((prev) => prev.filter((m) => m.id !== model.id));
      }
      onSuccess?.();
    } catch (err) {
      setMessage('删除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setDeletingModelId(null);
      setConfirmDeleteModel(null);
    }
  };

  // 保存单个模型
  const handleSaveModel = async (model: ModelFormData, index: number) => {
    if (!platform?.id && !currentPlatformId) return;

    if (!model.name.trim() || !model.model_id.trim()) {
      setMessage('请输入模型名称和模型ID');
      return;
    }

    const targetPlatformId = currentPlatformId || platform?.id;
    const existingModel = (fetchedModels as Model[] | undefined)?.find((item) => item.id === model.id);
    setMessage(null);
    setSavingModels((prev) => new Set([...prev, model.id || index]));

    try {
      if (model.id && !model._isNew) {
        await updateModel(model.id, {
          name: model.name,
          model_id: model.model_id,
          description: model.description,
          config: withProviderProtocol(existingModel?.config, model.protocol),
          is_active: model.is_active,
        });
      } else {
        await createModel({
          platform_id: targetPlatformId,
          name: model.name,
          model_id: model.model_id,
          description: model.description,
          config: withProviderProtocol(undefined, model.protocol),
          is_active: model.is_active,
        });
      }

      if (targetPlatformId) {
        await fetchModels(targetPlatformId);
      }
      onSuccess?.();
    } catch (err) {
      setMessage('保存失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setSavingModels((prev) => {
        const next = new Set(prev);
        next.delete(model.id || index);
        return next;
      });
    }
  };

  // 返回上一步
  const handleBack = () => {
    if (mode === 'create' && step === 'select') {
      // 重置为初始状态
      setPlatformData({
        name: '',
        slug: '',
        description: '',
        api_endpoint: '',
        api_key: '',
        is_active: true,
      });
      setModels([]);
      setStep('select');
      onOpenChange(false);
    } else if (mode === 'create') {
      setStep('select');
    } else {
      onOpenChange(false);
    }
  };

  // 保存平台（创建模式：必须先完成平台和模型配置）
  const handleSavePlatform = async () => {
    try {
      // 验证平台信息
      if (!platformData.name || !platformData.name.trim()) {
        setMessage('请填写供应商名称');
        return;
      }
      if (!platformData.api_endpoint || !platformData.api_endpoint.trim()) {
        setMessage('请填写供应商端点');
        return;
      }

      // 验证：必须至少有一个模型
      if (models.length === 0) {
        setMessage('请至少添加一个模型');
        return;
      }

      // 验证：每个模型必须填写名称和模型ID
      const invalidModel = models.find((m) => !m.name.trim() || !m.model_id.trim());
      if (invalidModel) {
        setMessage(`模型 "${invalidModel.name || '未命名'}" 缺少名称或模型ID，请完善后再保存`);
        return;
      }

      // 判断是创建还是更新
      const isUpdating = mode === 'edit' || (platform?.id && !models.some((m) => m._isNew));

      if (isUpdating && platform?.id) {
        // 更新已有平台
        await update(platform.id, {
          ...platformData,
          config: buildPlatformConfig(platform.config as Record<string, unknown> | undefined),
        });
        onSuccess?.();
        onOpenChange(false);
      } else {
        const existingSlugs = new Set((platforms as Platform[]).map((p) => p.slug));
        const baseSlug = buildSupplierSlug(platformData.name, platformData.api_endpoint);
        let candidateSlug = baseSlug;
        let counter = 2;

        while (existingSlugs.has(candidateSlug)) {
          candidateSlug = `${baseSlug}-${counter}`;
          counter += 1;
        }

        const result = await create({
          ...platformData,
          slug: candidateSlug,
          config: buildPlatformConfig(undefined),
        });

        if (result.data) {
          const createdPlatform = result.data as Platform & { id: number };
          setCurrentPlatformId(createdPlatform.id);

          // 创建所有模型
          for (const model of models) {
            if (model.name && model.model_id) {
              await createModel({
                platform_id: createdPlatform.id,
                name: model.name,
                model_id: model.model_id,
                description: model.description,
                config: withProviderProtocol(undefined, model.protocol),
                is_active: model.is_active,
              });
            }
          }

          onSuccess?.();
          onOpenChange(false);
        }
      }
    } catch (error) {
      setMessage('保存失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 完成并保存
  const handleFinish = async () => {
    if (step === 'models') {
      // 在 models step 完成时保存所有
      try {
        const targetPlatformId = currentPlatformId || platform?.id;
        for (const model of models.filter((m) => m._isNew)) {
          if (model.name && model.model_id && targetPlatformId) {
            await createModel({
              platform_id: targetPlatformId,
              name: model.name,
              model_id: model.model_id,
              description: model.description,
              config: withProviderProtocol(undefined, model.protocol),
              is_active: model.is_active,
            });
          }
        }
        onSuccess?.();
        onOpenChange(false);
      } catch (error) {
        setMessage('保存失败: ' + (error instanceof Error ? error.message : '未知错误'));
      }
    } else {
      onOpenChange(false);
    }
  };

  // 删除平台
  const handleDelete = async () => {
    if (!platform) {
      return;
    }

    try {
      await remove(platform.id);
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      setMessage('删除失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setConfirmDeletePlatformOpen(false);
    }
  };

  // ========== 渲染函数 ==========

  // 步骤1：选择协议模板
  const renderSelectStep = () => (
    <div className="space-y-6 py-4">
      <div className="space-y-2">
        <Label className="text-base font-medium">选择首个模型协议模板</Label>
        <p className="text-sm text-muted-foreground">
          先选一个常用协议，后续每个模型都可以单独修改。
        </p>
      </div>

      <RadioGroup
        value={models[0]?.protocol}
        onValueChange={(value) => handleProtocolTemplateSelect(value as ProviderProtocol)}
        className="gap-2"
      >
        {PROTOCOL_TEMPLATES.map((template) => (
          <label
            key={template.protocol}
            className="flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors hover:border-primary"
          >
            <RadioGroupItem value={template.protocol} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{template.title}</div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
            </div>
          </label>
        ))}
      </RadioGroup>
    </div>
  );

  // 步骤2/编辑：供应商配置表单
  const renderPlatformForm = () => (
    <div className="space-y-6 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">供应商名称 *</Label>
          <Input
            id="name"
            placeholder="如：书言 AI"
            value={platformData.name}
            onChange={(e) =>
              setPlatformData({ ...platformData, name: e.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="api_key">API 密钥</Label>
          <Input
            id="api_key"
            type="password"
            placeholder="输入 API 密钥（可选）"
            value={platformData.api_key}
            onChange={(e) =>
              setPlatformData({ ...platformData, api_key: e.target.value })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="api_endpoint">供应商端点 *</Label>
        <Input
          id="api_endpoint"
          placeholder="https://platform.shuyanai.com"
          value={platformData.api_endpoint}
          onChange={(e) =>
            setPlatformData({ ...platformData, api_endpoint: e.target.value })
          }
        />
        <p className="text-xs text-muted-foreground">
          只填写根端点即可，具体请求 URL 会根据每个模型选择的协议自动拼接。
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">描述</Label>
        <Textarea
          id="description"
          placeholder="描述该平台的功能和用途"
          value={platformData.description}
          onChange={(e) =>
            setPlatformData({ ...platformData, description: e.target.value })
          }
        />
      </div>
    </div>
  );

  // 模型列表
  const renderModelsTab = () => (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {models.length} 个模型
          </span>
        </div>
        <Button size="sm" onClick={() => handleAddModel()} disabled={loading}>
          <Plus className="h-4 w-4 mr-1" />
          添加模型
        </Button>
      </div>

      {fetchingModels && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!fetchingModels && (
        <div className="space-y-3">
          {models.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8">
                <p className="text-muted-foreground mb-4">暂未配置任何模型</p>
                <Button variant="outline" onClick={() => handleAddModel()}>
                  <Plus className="h-4 w-4 mr-2" />
                  添加第一个模型
                </Button>
              </CardContent>
            </Card>
          ) : (
            models.map((model, index) => {
              const original = (fetchedModels as Model[] | undefined)?.find(
                (m) => m.id === model.id
              );
              const isSaving = savingModels.has(model.id || index);
              const isDeleting = deletingModelId === model.id;

              return (
                <Card key={model.id || `new-${index}`} className={model._isNew ? 'border-primary' : ''}>
                  <CardContent className="p-4">
                    {model._isEditing ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs">名称 *</Label>
                            <Input
                              placeholder="如：GPT-4"
                              value={model.name}
                              onChange={(e) =>
                                handleModelChange(index, 'name', e.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">模型ID *</Label>
                            <Input
                              placeholder="如：gpt-4"
                              value={model.model_id}
                              onChange={(e) =>
                                handleModelChange(index, 'model_id', e.target.value)
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">描述（可选）</Label>
                          <Input
                            placeholder="简短描述模型用途"
                            value={model.description}
                              onChange={(e) =>
                                handleModelChange(index, 'description', e.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">协议</Label>
                            <Select
                              value={model.protocol}
                              onValueChange={(value: ProviderProtocol) =>
                                handleModelChange(index, 'protocol', value)
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="选择协议" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="openai">OpenAI</SelectItem>
                                <SelectItem value="anthropic">Anthropic</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground">
                              请求地址将自动拼成 {resolveProtocolEndpoint(platformData.api_endpoint || 'https://api.example.com', model.protocol)}
                            </p>
                          </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Switch
                              id={`model-active-${index}`}
                              checked={model.is_active}
                              onCheckedChange={(checked) =>
                                handleModelChange(index, 'is_active', checked)
                              }
                            />
                            <Label htmlFor={`model-active-${index}`} className="text-sm cursor-pointer">
                              {model.is_active ? '启用' : '停用'}
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => cancelEdit(index)}>
                              <X className="h-4 w-4 mr-1" />
                              取消
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveModel(model, index)}
                              disabled={isSaving || isDeleting}
                            >
                              {isSaving ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4 mr-1" />
                              )}
                              保存
                            </Button>
                          </div>
                        </div>
                        {model._isNew && (
                          <p className="text-xs text-primary">新模型：完成编辑后点击保存</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{model.name}</span>
                            <Badge variant={model.is_active ? 'default' : 'secondary'}>
                              {model.is_active ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  启用
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-3 w-3 mr-1" />
                                  停用
                                </>
                              )}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {model.model_id}
                            {` · ${model.protocol === 'anthropic' ? 'Anthropic' : 'OpenAI'}`}
                            {model.description && ` · ${model.description}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost" onClick={() => toggleEdit(index)}>
                            <Edit2 className="h-4 w-4 mr-1" />
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteModel(model)}
                            disabled={isSaving || isDeleting}
                            className="text-destructive hover:text-destructive"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 mr-1" />
                            )}
                            删除
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        提示：模型名称用于界面显示，模型ID用于 API 调用；同一供应商下的不同模型可以分别选择 OpenAI 或 Anthropic 协议。
      </p>
    </div>
  );

  // 渲染对话框内容
  const renderContent = () => {
    // 选择适配器步骤
    if (mode === 'create' && step === 'select') {
      return renderSelectStep();
    }

    // 供应商配置 + 模型配置（创建和编辑模式通用）
    return (
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="platform" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            供应商配置
          </TabsTrigger>
          <TabsTrigger value="models" className="flex items-center gap-2">
            <Box className="h-4 w-4" />
            模型与协议
            {models.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {models.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="platform" className="mt-4">
          {renderPlatformForm()}
        </TabsContent>

        <TabsContent value="models" className="mt-4">
          {renderModelsTab()}
        </TabsContent>
      </Tabs>
    );
  };

  // 标题和描述
  const getTitle = () => {
    if (mode === 'create' && step === 'select') return '添加新供应商';
    return platformData.name || '配置';
  };

  const getDescription = () => {
    if (mode === 'create' && step === 'select') return '选择一个常用协议模板作为起点';
    return '填写供应商端点，并为每个模型单独选择协议后保存';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        {message && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {message}
          </div>
        )}

        {renderContent()}

        {/* 底部按钮 */}
        <DialogFooter className={`flex-row gap-2 ${mode === 'edit' ? 'justify-between' : 'justify-end'}`}>
          {mode === 'edit' && (
            <div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDeletePlatformOpen(true)}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                删除供应商
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleBack}>
              {mode === 'create' && step === 'select' ? '取消' : '上一步'}
            </Button>
            <Button onClick={handleSavePlatform} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog
        open={!!confirmDeleteModel}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteModel(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除模型</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteModel
                ? `确定删除模型「${confirmDeleteModel.name}」吗？相关延迟记录和评估记录也会一并删除。`
                : '确定删除这个模型吗？'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirmDeleteModel) return;
                const index = models.findIndex((item) => item.id === confirmDeleteModel.id);
                void handleDeleteModel(confirmDeleteModel, index);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDeletePlatformOpen}
        onOpenChange={setConfirmDeletePlatformOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除供应商</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除当前供应商吗？这会同时删除供应商下所有模型、延迟记录和评估记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              删除供应商
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
