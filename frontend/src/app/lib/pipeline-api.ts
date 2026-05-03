/**
 * Pipeline API 调用函数
 */

export interface PipelineParams {
  project_id: number;
  params: Record<string, Record<string, unknown>>;
  marker_file_path?: string;
}

export interface PipelineTask {
  id: string;
  step: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  progress_message?: string;
  result_path?: string;
  error_msg?: string;
}

export interface Pipeline {
  id: string;
  project_id: number;
  user_id: number;
  status: string;
  current_step?: string;
  error_step?: string;
  error_msg?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  tasks: PipelineTask[];
}

export async function createPipeline(
  token: string,
  data: PipelineParams
): Promise<{ pipeline_id: string; status: string; message: string }> {
  const response = await fetch("/api/pipeline", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to create pipeline: ${response.statusText}`);
  }

  return response.json();
}

export async function getPipeline(
  token: string,
  pipelineId: string
): Promise<Pipeline> {
  const response = await fetch(`/api/pipeline/${pipelineId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get pipeline: ${response.statusText}`);
  }

  return response.json();
}

export async function listPipelines(
  token: string,
  projectId: number,
  limit: number = 10
): Promise<Pipeline[]> {
  const response = await fetch(`/api/pipeline?project_id=${projectId}&limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list pipelines: ${response.statusText}`);
  }

  return response.json();
}
