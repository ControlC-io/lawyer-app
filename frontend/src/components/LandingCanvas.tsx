import { useState } from "react";
import { Canvas } from "@/components/workflow/Canvas";
import { WorkflowStep, WorkflowConnection } from "@/pages/WorkflowEditor";
import { useLanguage } from "@/contexts/LanguageContext";

export function LandingCanvas() {
  const { t } = useLanguage();

  // Create example workflow steps
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: "start-1",
      step_type: "start",
      name: t("canvas.nodes.start") as string,
      position_x: 150,
      position_y: 200,
      config: {},
    },
    {
      id: "action-1",
      step_type: "action",
      name: t("canvas.nodes.fetchData") as string,
      position_x: 350,
      position_y: 200,
      config: {},
      action_type: "automatic",
    },
    {
      id: "form-1",
      step_type: "edit_form",
      name: t("canvas.nodes.form") as string,
      position_x: 550,
      position_y: 200,
      config: {
        outputs: ["Submit", "Cancel"],
      },
    },
    {
      id: "decision-1",
      step_type: "decision",
      name: t("canvas.nodes.validation") as string,
      position_x: 750,
      position_y: 200,
      config: {
        outputs: ["yes", "no"],
      },
      decision_node_type: "Human",
    },
    {
      id: "action-2",
      step_type: "action",
      name: t("canvas.nodes.process") as string,
      position_x: 950,
      position_y: 120,
      config: {},
      action_type: "automatic",
    },
    {
      id: "action-3",
      step_type: "action",
      name: t("canvas.nodes.reject") as string,
      position_x: 950,
      position_y: 280,
      config: {},
      action_type: "manual",
    },
    {
      id: "end-1",
      step_type: "end",
      name: t("canvas.nodes.end") as string,
      position_x: 1150,
      position_y: 200,
      config: {},
    },
  ]);

  const [connections, setConnections] = useState<WorkflowConnection[]>([
    {
      id: "conn-1",
      source_step_id: "start-1",
      target_step_id: "action-1",
      output_name: "default",
      config: {
        color: "hsl(var(--primary))",
        style: "solid",
      },
    },
    {
      id: "conn-2",
      source_step_id: "action-1",
      target_step_id: "form-1",
      output_name: "default",
      config: {
        color: "hsl(var(--primary))",
        style: "solid",
      },
    },
    {
      id: "conn-3",
      source_step_id: "form-1",
      target_step_id: "decision-1",
      output_name: "Submit",
      config: {
        color: "hsl(var(--primary))",
        style: "solid",
      },
    },
    {
      id: "conn-4",
      source_step_id: "decision-1",
      target_step_id: "action-2",
      output_name: "yes",
      config: {
        color: "hsl(var(--primary))",
        style: "solid",
      },
    },
    {
      id: "conn-5",
      source_step_id: "decision-1",
      target_step_id: "action-3",
      output_name: "no",
      config: {
        color: "hsl(var(--primary))",
        style: "solid",
      },
    },
    {
      id: "conn-6",
      source_step_id: "action-2",
      target_step_id: "end-1",
      output_name: "default",
      config: {
        color: "hsl(var(--primary))",
        style: "solid",
      },
    },
    {
      id: "conn-7",
      source_step_id: "action-3",
      target_step_id: "end-1",
      output_name: "default",
      config: {
        color: "hsl(var(--primary))",
        style: "solid",
      },
    },
  ]);

  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);

  // Handle step updates (for drag & drop)
  const handleUpdateStep = (step: WorkflowStep) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === step.id ? step : s))
    );
  };

  // Handle step selection - do nothing to prevent opening properties panel
  const handleSelectStep = (step: WorkflowStep | null) => {
    // Don't set selected step - this prevents the properties panel from opening
    setSelectedStep(null);
  };

  // Handle step deletion
  const handleDeleteStep = (stepId: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
    setConnections((prev) =>
      prev.filter(
        (c) => c.source_step_id !== stepId && c.target_step_id !== stepId
      )
    );
  };

  // Handle connection creation
  const handleAddConnection = (
    sourceId: string,
    targetId: string,
    outputName: string
  ) => {
    const newConnection: WorkflowConnection = {
      id: `conn-${Date.now()}`,
      source_step_id: sourceId,
      target_step_id: targetId,
      output_name: outputName,
      config: {
        color: "hsl(var(--primary))",
        style: "solid",
      },
    };
    setConnections((prev) => [...prev, newConnection]);
  };

  // Handle connection update
  const handleUpdateConnection = (
    connectionId: string,
    config: { color: string; style: "solid" | "dashed" }
  ) => {
    setConnections((prev) =>
      prev.map((c) =>
        c.id === connectionId ? { ...c, config } : c
      )
    );
  };

  // Handle connection deletion
  const handleDeleteConnection = (connectionId: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== connectionId));
  };

  return (
    <div className="w-full h-[500px] rounded-lg border-2 border-border bg-gradient-to-br from-background to-muted/20 overflow-hidden">
      <Canvas
        steps={steps}
        connections={connections}
        selectedStep={null}
        onSelectStep={handleSelectStep}
        onUpdateStep={handleUpdateStep}
        onDeleteStep={handleDeleteStep}
        onAddConnection={handleAddConnection}
        onUpdateConnection={handleUpdateConnection}
        onDeleteConnection={handleDeleteConnection}
        readOnly={false}
        hideEditButton={true}
      />
    </div>
  );
}

