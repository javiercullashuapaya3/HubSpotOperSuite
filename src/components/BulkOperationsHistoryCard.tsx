import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  User,
  Calendar,
  Search,
  Copy,
  Check,
  Database,
  Layers,
  History,
  RefreshCw,
  FileCode,
  ShieldAlert,
  AlertCircle,
} from 'lucide-react';
import { BulkUpdateJob, MYSQL_BULK_LOGS_DDL, SUPABASE_BULK_LOGS_DDL } from '../types/bulkHistory';
import { bulkHistoryService } from '../services/bulkHistoryService';

interface BulkOperationsHistoryCardProps {
  currentJobId?: string;
  onClose?: () => void;
  isEmbeddedInResults?: boolean;
}

export const BulkOperationsHistoryCard: React.FC<BulkOperationsHistoryCardProps> = ({
  currentJobId,
  isEmbeddedInResults = false,
}) => {
  const [historyList, setHistoryList] = useState<BulkUpdateJob[]>(() => bulkHistoryService.getAll());
  const [activeTab, setActiveTab] = useState<'history' | 'mysql_schema'>('history');
  const [ddlDialect, setDdlDialect] = useState<'supabase' | 'mysql'>('supabase');
  const [copiedDdl, setCopiedDdl] = useState(false);
  const [copiedFixSql, setCopiedFixSql] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(currentJobId || null);
  const [isRetryingSync, setIsRetryingSync] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  // Supabase diagnostics
  const [supabaseHealth, setSupabaseHealth] = useState<{
    tableExists: boolean;
    rlsBlocked: boolean;
    message: string;
    jobsCount: number;
  } | null>(null);

  // Filters for previous executions
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUser, setFilterUser] = useState('ALL');
  const [filterMode, setFilterMode] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterDate, setFilterDate] = useState('ALL');

  const checkConnection = async () => {
    const health = await bulkHistoryService.testSupabaseConnection();
    setSupabaseHealth(health);
  };

  useEffect(() => {
    checkConnection();
    // Attempt to load synced history from Supabase if table is live
    bulkHistoryService.fetchFromSupabase().then((items) => {
      if (items && items.length > 0) {
        setHistoryList(items);
      }
    });
  }, []);

  const refreshList = async () => {
    await checkConnection();
    const local = bulkHistoryService.getAll();
    setHistoryList(local);
    const remote = await bulkHistoryService.fetchFromSupabase();
    if (remote && remote.length > 0) {
      setHistoryList(remote);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    setIsRetryingSync(jobId);
    try {
      await bulkHistoryService.retrySyncJob(jobId);
      setHistoryList(bulkHistoryService.getAll());
      await checkConnection();
    } finally {
      setIsRetryingSync(null);
    }
  };

  const handleSyncAllPending = async () => {
    setIsSyncingAll(true);
    try {
      await bulkHistoryService.syncAllPending();
      setHistoryList(bulkHistoryService.getAll());
      await checkConnection();
    } finally {
      setIsSyncingAll(false);
    }
  };

  const pendingCount = useMemo(() => {
    return historyList.filter((j) => j.supabaseSyncStatus !== 'synced').length;
  }, [historyList]);

  // Distinct users for dropdown filter
  const distinctUsers = useMemo(() => {
    const users = new Set<string>();
    historyList.forEach((j) => {
      if (j.executedByUsername) users.add(j.executedByUsername);
    });
    return Array.from(users);
  }, [historyList]);

  // Filtered operations
  const filteredHistory = useMemo(() => {
    return historyList.filter((job) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchUser = job.executedByUsername.toLowerCase().includes(q);
        const matchClient = String(job.clientId).includes(q);
        const matchJobId = job.jobUuid.toLowerCase().includes(q) || job.id.toLowerCase().includes(q);
        const matchChanges = job.appliedChanges.some(
          (c) => c.label.toLowerCase().includes(q) || c.value.toLowerCase().includes(q),
        );
        const matchFilters = job.filterCriteria.some(
          (f) => f.label.toLowerCase().includes(q) || f.value.toLowerCase().includes(q),
        );
        if (!matchUser && !matchClient && !matchJobId && !matchChanges && !matchFilters) return false;
      }

      // User
      if (filterUser !== 'ALL' && job.executedByUsername !== filterUser) {
        return false;
      }

      // Mode
      if (filterMode !== 'ALL' && job.executionMode !== filterMode) {
        return false;
      }

      // Status
      if (filterStatus !== 'ALL' && job.status !== filterStatus) {
        return false;
      }

      // Date
      if (filterDate !== 'ALL') {
        const jobDate = new Date(job.startedAt).getTime();
        const now = Date.now();
        if (filterDate === 'today') {
          const startOfToday = new Date().setHours(0, 0, 0, 0);
          if (jobDate < startOfToday) return false;
        } else if (filterDate === 'last_7d') {
          if (now - jobDate > 7 * 24 * 3600 * 1000) return false;
        } else if (filterDate === 'last_30d') {
          if (now - jobDate > 30 * 24 * 3600 * 1000) return false;
        }
      }

      return true;
    });
  }, [historyList, searchQuery, filterUser, filterMode, filterStatus, filterDate]);

  const handleCopyDdl = () => {
    const textToCopy = ddlDialect === 'supabase' ? SUPABASE_BULK_LOGS_DDL : MYSQL_BULK_LOGS_DDL;
    navigator.clipboard.writeText(textToCopy);
    setCopiedDdl(true);
    setTimeout(() => setCopiedDdl(false), 2500);
  };

  const RLS_FIX_SQL = `-- Deshabilitar RLS en tablas de auditoria para permitir el guardado directo (Igual a tabla companies):
ALTER TABLE public.bulk_update_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_update_job_items DISABLE ROW LEVEL SECURITY;`;

  const handleCopyFixSql = () => {
    navigator.clipboard.writeText(RLS_FIX_SQL);
    setCopiedFixSql(true);
    setTimeout(() => setCopiedFixSql(false), 2500);
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden ${isEmbeddedInResults ? 'mt-4' : ''}`}>
      {/* Top Header */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
              Historial de Actualizaciones Masivas &amp; Auditoría Supabase
            </h3>
            <p className="text-[11px] text-slate-500">
              Auditoría en tiempo real con persistencia en <code>bulk_update_jobs</code> y <code>bulk_update_job_items</code>.
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Historial ({historyList.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('mysql_schema')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'mysql_schema'
                  ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Esquema SQL ({ddlDialect === 'supabase' ? 'Supabase' : 'MySQL'})</span>
            </button>
          </div>

          <button
            onClick={refreshList}
            className="p-1.5 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            title="Refrescar historial y verificar conexión"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {activeTab === 'history' ? (
        <div className="p-4 space-y-4">
          {/* Supabase Status Alert Banner */}
          {supabaseHealth?.rlsBlocked && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 space-y-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Atención: Supabase bloqueó la inserción por Row Level Security (Error 42501)</span>
                </div>
                <button
                  onClick={handleCopyFixSql}
                  className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] shadow-2xs cursor-pointer inline-flex items-center gap-1 shrink-0"
                >
                  {copiedFixSql ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedFixSql ? '¡SQL Copiado!' : 'Copiar Solución SQL'}</span>
                </button>
              </div>

              <p className="text-[11px] text-amber-800 leading-relaxed">
                Las tablas <code>bulk_update_jobs</code> y <code>bulk_update_job_items</code> existen en tu base de datos Supabase, pero tienen RLS habilitado sin políticas de inserción. Para que se guarden automáticamente, ejecuta en el SQL Editor de tu Supabase:
              </p>

              <pre className="p-2 rounded bg-amber-100/80 border border-amber-200 text-[11px] font-mono text-amber-950 overflow-x-auto select-all">
                {RLS_FIX_SQL}
              </pre>

              {pendingCount > 0 && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-amber-700">
                    Hay <strong>{pendingCount}</strong> operaciones en cola local listas para sincronizarse.
                  </span>
                  <button
                    onClick={handleSyncAllPending}
                    disabled={isSyncingAll}
                    className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[11px] cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncingAll ? 'animate-spin' : ''}`} />
                    <span>{isSyncingAll ? 'Sincronizando...' : 'Reintentar sincronización ahora'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Connected status badge if operational */}
          {supabaseHealth && !supabaseHealth.rlsBlocked && supabaseHealth.tableExists && (
            <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>
                  Supabase conectado: Tablas <code>bulk_update_jobs</code> ({supabaseHealth.jobsCount} registros) y <code>bulk_update_job_items</code> activas.
                </span>
              </div>
              {pendingCount > 0 && (
                <button
                  onClick={handleSyncAllPending}
                  disabled={isSyncingAll}
                  className="px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold cursor-pointer inline-flex items-center gap-1"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
                  <span>Sincronizar {pendingCount} pendientes</span>
                </button>
              )}
            </div>
          )}

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 bg-slate-50/70 p-3 rounded-lg border border-slate-200 text-xs">
            {/* Search Input */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                Buscar por palabra clave
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Usuario, campo, valor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-md pl-7 pr-2 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
              </div>
            </div>

            {/* Filter by User */}
            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                Usuario de Sesión
              </label>
              <select
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Todos los Usuarios</option>
                {distinctUsers.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Date */}
            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                Fecha de Ejecución
              </label>
              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Cualquier Fecha</option>
                <option value="today">Hoy</option>
                <option value="last_7d">Últimos 7 días</option>
                <option value="last_30d">Últimos 30 días</option>
              </select>
            </div>

            {/* Filter by Execution Mode */}
            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                Modo de Envío
              </label>
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Todos los Modos</option>
                <option value="lote">Sincronización en Lote (lote)</option>
                <option value="individual">Sincronización Individual (individual)</option>
              </select>
            </div>

            {/* Filter by Status */}
            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                Estado
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Todos los Estados</option>
                <option value="completado">Completado sin errores</option>
                <option value="parcialmente_fallido">Con advertencias / errores parciales</option>
                <option value="fallido">Fallido</option>
              </select>
            </div>
          </div>

          {/* Results List */}
          {historyList.length === 0 ? (
            <div className="py-12 px-4 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 space-y-2">
              <div className="w-10 h-10 mx-auto rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                <History className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                No hay operaciones registradas aún
              </h4>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto leading-relaxed">
                Cada vez que ejecutes una actualización masiva o individual en el CRM de HubSpot, se registrará aquí en tiempo real y se guardará en tus tablas de Supabase (<code>bulk_update_jobs</code> y <code>bulk_update_job_items</code>).
              </p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No se encontraron actualizaciones masivas que coincidan con los filtros seleccionados.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredHistory.map((job) => {
                const isExpanded = expandedJobId === job.id;
                const isRecent = job.id === currentJobId;

                return (
                  <div
                    key={job.id}
                    className={`rounded-xl border transition-all ${
                      isRecent
                        ? 'border-indigo-400 bg-indigo-50/20 shadow-xs'
                        : isExpanded
                        ? 'border-slate-300 bg-slate-50/40 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {/* Header Row */}
                    <div
                      onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                      className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${
                            job.status === 'completado'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {job.status === 'completado' ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <AlertTriangle className="w-4 h-4" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-slate-900">
                              {job.totalTargetRecords} Leads Modificados
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                job.executionMode === 'lote'
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  : 'bg-purple-50 text-purple-700 border-purple-200'
                              }`}
                            >
                              {job.executionMode === 'lote'
                                ? `Lote (${job.batchCount} bloques)`
                                : 'Individual'}
                            </span>

                            {/* Supabase Sync Status Badge */}
                            {job.supabaseSyncStatus === 'synced' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                <Database className="w-2.5 h-2.5" />
                                <span>Supabase (ID: #{job.id})</span>
                              </span>
                            ) : job.supabaseSyncStatus === 'rls_blocked' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                                <ShieldAlert className="w-2.5 h-2.5 text-amber-600" />
                                <span>Bloqueado por RLS</span>
                              </span>
                            ) : job.supabaseSyncStatus === 'failed' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                                <AlertCircle className="w-2.5 h-2.5 text-rose-600" />
                                <span>Error Supabase</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                Sincronizando...
                              </span>
                            )}

                            {isRecent && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                Recién Ejecutado
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 flex-wrap">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400" />
                              <strong className="text-slate-700">{job.executedByUsername}</strong>
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              {formatDate(job.startedAt)}
                            </span>
                            {job.durationMs && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  {(job.durationMs / 1000).toFixed(1)}s
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1 justify-end">
                            <Check className="w-3.5 h-3.5" />
                            <span>{job.successfulRecords} sincronizados</span>
                          </div>
                          {job.failedRecords > 0 && (
                            <div className="text-[11px] font-medium text-rose-600">
                              {job.failedRecords} fallidos
                            </div>
                          )}
                        </div>

                        {/* Retry Sync Button if not synced */}
                        {job.supabaseSyncStatus !== 'synced' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetryJob(job.id);
                            }}
                            disabled={isRetryingSync === job.id}
                            className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-semibold cursor-pointer inline-flex items-center gap-1 shrink-0"
                            title="Reintentar guardar este registro en Supabase"
                          >
                            <RefreshCw className={`w-3 h-3 ${isRetryingSync === job.id ? 'animate-spin' : ''}`} />
                            <span>Reintentar</span>
                          </button>
                        )}

                        <div className="p-1 rounded-md text-slate-400 hover:text-slate-700">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3 bg-white/90 rounded-b-xl">
                        {/* Supabase error notice if failed */}
                        {job.supabaseError && (
                          <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <strong className="block text-[11px]">Detalle del estado en Supabase:</strong>
                              <p className="text-[11px] font-mono mt-0.5">{job.supabaseError}</p>
                            </div>
                          </div>
                        )}

                        {/* Criterios y Cambios */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2">
                          {/* Cambios Aplicados */}
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
                              Valores modificados en HubSpot:
                            </span>
                            <div className="space-y-1">
                              {(job.appliedChanges || []).map((chg, i) => (
                                <div key={i} className="flex justify-between items-center text-[11px]">
                                  <span className="text-slate-600 font-medium">{chg.label}:</span>
                                  <span
                                    className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                                      chg.isClear
                                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                        : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                                    }`}
                                  >
                                    {chg.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Criterios de Selección */}
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
                              Filtros de selección aplicados:
                            </span>
                            {job.filterCriteria && job.filterCriteria.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {(job.filterCriteria || []).map((crit, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-slate-200 text-[10px] text-slate-800"
                                  >
                                    <span className="text-slate-500">{crit.label}:</span>
                                    <strong className="text-slate-900">{crit.value}</strong>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-500 italic">
                                Selección manual sobre lista de contactos.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Technical Metadata Bar for Reference */}
                        <div className="p-2.5 bg-slate-100/70 rounded-lg text-[10px] font-mono text-slate-600 flex flex-wrap items-center justify-between gap-2 border border-slate-200">
                          <div>
                            <span className="text-slate-400">client_id:</span>{' '}
                            <strong className="text-slate-800">{job.clientId}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">job_uuid:</span>{' '}
                            <strong className="text-slate-800">{job.jobUuid}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">usuario:</span>{' '}
                            <strong className="text-slate-800">{job.executedByUsername}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">supabase_sync:</span>{' '}
                            <strong className={job.supabaseSyncStatus === 'synced' ? 'text-emerald-700' : 'text-amber-700'}>
                              {job.supabaseSyncStatus || 'pending'}
                            </strong>
                          </div>
                        </div>

                        {/* Detail Items if recorded */}
                        {job.items && job.items.length > 0 && (
                          <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <div className="bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase text-slate-600 border-b border-slate-200">
                              Muestra de Contactos Afectados ({job.items.length} registrados):
                            </div>
                            <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 text-[11px]">
                              {(job.items || []).map((item) => (
                                <div key={item.id} className="p-2 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {item.status === 'exitoso' ? (
                                      <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                                    ) : (
                                      <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                                    )}
                                    <span className="font-semibold text-slate-800">{item.recordIdentifier}</span>
                                    <span className="text-[10px] font-mono text-slate-400">
                                      (ID: {item.recordId})
                                    </span>
                                  </div>
                                  <span
                                    className={`text-[10px] px-2 py-0.5 rounded font-medium border ${
                                      item.status === 'exitoso'
                                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                        : 'text-rose-700 bg-rose-50 border-rose-200'
                                    }`}
                                  >
                                    {item.status === 'exitoso'
                                      ? `Lote ${item.batchChunkIndex}`
                                      : 'Error al actualizar'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Database Schema & Architecture Tab */
        <div className="p-5 space-y-4">
          <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-slate-100 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Script DDL de Tablas Genéricas ({ddlDialect === 'supabase' ? 'Supabase / PostgreSQL' : 'MySQL 8.0+'})
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setDdlDialect('supabase')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      ddlDialect === 'supabase'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Supabase (PostgreSQL)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDdlDialect('mysql')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      ddlDialect === 'mysql'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    MySQL
                  </button>
                </div>

                <button
                  onClick={handleCopyDdl}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
                >
                  {copiedDdl ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedDdl ? '¡DDL Copiado!' : `Copiar DDL ${ddlDialect === 'supabase' ? 'Supabase' : 'MySQL'}`}
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Estructura normalizada en 2 tablas (<strong>Cabecera y Detalle</strong>) con nombres de tablas y campos en inglés (<code>bulk_update_jobs</code>, <code>client_id</code>, <code>executed_by_username</code>, etc.), snapshots en JSON y valores de estados/modos en español (<code>'lote'</code>, <code>'individual'</code>, <code>'completado'</code>, <code>'exitoso'</code>).
            </p>

            <pre className="bg-slate-950 p-4 rounded-lg overflow-x-auto text-[11px] font-mono text-emerald-400 border border-slate-800 max-h-96 leading-relaxed selection:bg-indigo-800 selection:text-white">
              {ddlDialect === 'supabase' ? SUPABASE_BULK_LOGS_DDL : MYSQL_BULK_LOGS_DDL}
            </pre>
          </div>

          {/* Quick Summary of Tables */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                Tabla 1: <code>bulk_update_jobs</code> (Cabecera)
              </span>
              <p className="text-slate-600 text-[11px]">
                Registra la operación maestra: <code>client_id</code>, <code>executed_by_username</code>, fecha, duración, total de leads modificados, <code>execution_mode</code> ('lote'/'individual'), <code>status</code> ('pendiente', 'en_proceso', 'completado', 'parcialmente_fallido', 'fallido') y snapshots JSON de filtros y cambios.
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-600" />
                Tabla 2: <code>bulk_update_job_items</code> (Detalle)
              </span>
              <p className="text-slate-600 text-[11px]">
                Almacena el resultado puntual de cada contacto individual (<code>record_id</code>, nombre/email, número de lote, código de respuesta HTTP, valores asignados y estado de éxito/error).
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
