import { ChangeEvent, useRef, useState } from 'react';
import { Database, Download, FileUp, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import * as api from '../lib/api';
import type { PlatformDataset } from '../lib/data/types';

interface DemoDataControlsProps {
  onDatasetChanged?: () => void;
}

const demoDatasetUrl = `${import.meta.env.BASE_URL}demo-data/survey-demo-dataset.json`;

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function assertDataset(value: unknown): Partial<PlatformDataset> {
  if (!value || typeof value !== 'object') {
    throw new Error('데이터 파일 형식이 올바르지 않습니다.');
  }

  const dataset = value as Partial<PlatformDataset>;
  const hasCollection = ['projects', 'risks', 'responses', 'departments', 'assignments'].some((key) =>
    Array.isArray(dataset[key as keyof PlatformDataset]),
  );

  if (!hasCollection) {
    throw new Error('projects, risks, responses, departments, assignments 중 하나 이상의 배열이 필요합니다.');
  }

  return dataset;
}

export function DemoDataControls({ onDatasetChanged }: DemoDataControlsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState('시연용 JSON을 불러오거나 현재 데이터를 내보낼 수 있습니다.');
  const [busy, setBusy] = useState(false);

  async function importDataset(dataset: Partial<PlatformDataset>, message: string) {
    setBusy(true);
    try {
      await api.importDataset(assertDataset(dataset), { replace: true });
      setStatus(message);
      onDatasetChanged?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLoadSample() {
    setBusy(true);
    try {
      const response = await fetch(demoDatasetUrl, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`샘플 데이터 파일을 찾지 못했습니다. (${response.status})`);
      }
      const dataset = await response.json();
      await api.importDataset(assertDataset(dataset), { replace: true });
      setStatus('샘플 시연 데이터를 불러왔습니다.');
      onDatasetChanged?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '샘플 데이터를 불러오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    setBusy(true);
    try {
      const dataset = await api.exportDataset();
      downloadJson(`living-lab-survey-demo-${new Date().toISOString().slice(0, 10)}.json`, dataset);
      setStatus('현재 브라우저 저장 데이터를 JSON으로 내보냈습니다.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '데이터를 내보내지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const dataset = JSON.parse(text);
      await importDataset(dataset, `${file.name} 파일을 불러왔습니다.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'JSON 파일을 읽지 못했습니다.');
    }
  }

  async function handleClear() {
    if (!window.confirm('현재 브라우저에 저장된 시연 데이터를 모두 초기화할까요?')) return;
    setBusy(true);
    try {
      await api.clearDataset();
      setStatus('브라우저 저장 데이터를 초기화했습니다.');
      onDatasetChanged?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '데이터를 초기화하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-100 bg-white/95 p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Database className="h-4 w-4 text-emerald-700" />
        시연 데이터
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={handleLoadSample} disabled={busy}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          샘플 불러오기
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          <FileUp className="mr-1.5 h-4 w-4" />
          JSON 가져오기
        </Button>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={busy}>
          <Download className="mr-1.5 h-4 w-4" />
          JSON 내보내기
        </Button>
        <Button size="sm" variant="ghost" onClick={handleClear} disabled={busy}>
          <RotateCcw className="mr-1.5 h-4 w-4" />
          초기화
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">{status}</p>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
