import { createFileRoute } from "@tanstack/react-router";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { useCallback, useEffect, useState } from "react";
import type { IntegratedConfiguration } from "~/lib/configurator/integrated-configuration";
import {
  createMappingOnlyConfig,
  createMappingValidateConfig,
  createTransformValidateConfig,
} from "~/lib/configurator/modular-configuration.js";
import {
  createVisualizationFromIntegrated,
  createVisualizationFromModular,
  getNodeStyle,
  type ConfigNodeData,
  type VisualizationConfig,
} from "~/lib/visualize";

export const Route = createFileRoute("/visualize")({
  component: RouteComponent,
});

// Sample configurations for demonstration
const sampleMappingOnly = createMappingOnlyConfig({
  name: "Darwin Core Mapping",
  mappings: [
    { sourceColumn: "organism_sex", targetField: "sex" },
    { sourceColumn: "latitude_dd", targetField: "decimalLatitude" },
    { sourceColumn: "longitude_dd", targetField: "decimalLongitude" },
  ],
});

const sampleMappingValidate = createMappingValidateConfig({
  name: "Mapping with Validation",
  mappings: [
    {
      sourceColumn: "organism_sex",
      targetField: "sex",
      validations: [
        {
          functionName: "validateControlledVocabulary",
          parameters: { vocabularyName: "sex" },
        },
      ],
    },
    {
      sourceColumn: "latitude_dd",
      targetField: "decimalLatitude",
      validations: [
        { functionName: "validateLatitude", parameters: {} },
        { functionName: "validateRequiredField", parameters: {} },
      ],
    },
  ],
});

const sampleTransformValidate = createTransformValidateConfig({
  name: "Transform and Validate",
  fields: [
    {
      fieldName: "eventDate",
      transformations: [
        {
          functionName: "parseDate",
          parameters: { inputFormat: "YYYY-MM-DD" },
        },
      ],
      validations: [
        { functionName: "validateDateFormat", parameters: {} },
        { functionName: "validateFutureDate", parameters: {} },
      ],
    },
  ],
});

const sampleIntegrated: IntegratedConfiguration = {
  name: "Full Pipeline Configuration",
  sourceFile: "biodiversity_data.csv",
  standard: "Darwin Core",
  globalParameters: {
    vocabularies: {},
  },
  fieldMappings: [
    {
      sourceColumn: "organism_sex",
      targetField: "sex",
      transformations: [
        {
          functionName: "normalizeCase",
          parameters: { targetCase: "lowercase" },
        },
      ],
      validations: [
        {
          functionName: "validateControlledVocabulary",
          parameters: { vocabularyName: "sex" },
        },
      ],
    },
    {
      sourceColumn: "collection_date",
      targetField: "eventDate",
      transformations: [
        {
          functionName: "parseDate",
          parameters: { inputFormat: "MM/DD/YYYY" },
        },
      ],
      validations: [
        { functionName: "validateDateFormat", parameters: {} },
        { functionName: "validateFutureDate", parameters: {} },
      ],
    },
  ],
};

// Custom node component with styled appearance
function CustomNode({ data }: { data: ConfigNodeData }) {
  const nodeStyle = getNodeStyle(data.type);

  // Determine if node should have input/output handles
  // const isSourceFile = data.type === "source-file";
  const isGroup = data.type === "group";
  const isSubgroup = data.type === "subgroup";
  // const isOutput = data.type === "output";

  // Handle logic based on actual connections (read-only visualization)
  // Only show handles where there are actual edges
  const showInputHandle = !isGroup && !isSubgroup && data.hasIncomingEdge;
  const showOutputHandle = !isGroup && !isSubgroup && data.hasOutgoingEdge;

  if (isGroup) {
    // Group nodes are handled by ReactFlow's group rendering
    return (
      <div className="text-center p-2 font-semibold text-gray-700 text-sm uppercase tracking-wide">
        {data.label}
      </div>
    );
  }

  if (isSubgroup) {
    // Subgroup nodes show field-specific labels
    return <div className="text-center p-1 font-medium text-gray-600 text-xs">{data.label}</div>;
  }

  return (
    <div
      className={`react-flow-node-override relative ${nodeStyle.className}`}
      style={{
        ...nodeStyle.style,
        margin: "0 !important",
        padding: "0 !important",
        boxSizing: "border-box",
        border: "none !important",
      }}
    >
      {showInputHandle && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-gray-700 !border-2 !border-white w-3 h-3 rounded-full"
        />
      )}

      <div className="flex flex-col items-center justify-center w-full h-full">
        <div className="font-semibold">{data.label}</div>
        {data.details && <div className="text-xs mt-1 opacity-75">{data.details}</div>}
        {data.parameters && (
          <div className="text-xs mt-1 bg-black/10 rounded px-2 py-1">
            {Object.keys(data.parameters).length} params
          </div>
        )}
      </div>

      {showOutputHandle && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-gray-700 !border-2 !border-white w-3 h-3 rounded-full"
        />
      )}
    </div>
  );
}

const nodeTypes = {
  default: CustomNode,
  group: CustomNode,
  custom: CustomNode,
};

function ConfigurationVisualizer() {
  const [selectedConfig, setSelectedConfig] = useState<
    "mapping-only" | "mapping-validate" | "transform-validate" | "integrated"
  >("mapping-only");
  const [showParameters, setShowParameters] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const { fitView } = useReactFlow();

  // Get current configuration and generate visualization
  const getCurrentVisualization = useCallback(() => {
    const vizConfig: VisualizationConfig = {
      layout: "vertical",
      showParameters,
      compactMode,
    };

    switch (selectedConfig) {
      case "mapping-only":
        return createVisualizationFromModular(sampleMappingOnly, vizConfig);
      case "mapping-validate":
        return createVisualizationFromModular(sampleMappingValidate, vizConfig);
      case "transform-validate":
        return createVisualizationFromModular(sampleTransformValidate, vizConfig);
      case "integrated":
        return createVisualizationFromIntegrated(sampleIntegrated, vizConfig);
      default:
        return { nodes: [], edges: [] };
    }
  }, [selectedConfig, showParameters, compactMode]);

  const { nodes: initialNodes, edges: initialEdges } = getCurrentVisualization();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update visualization when configuration changes
  const handleConfigChange = useCallback(
    (newConfig: typeof selectedConfig) => {
      setSelectedConfig(newConfig);
      // Use a timeout to ensure state is updated before generating visualization
      setTimeout(() => {
        const vizConfig: VisualizationConfig = {
          layout: "vertical",
          showParameters,
          compactMode,
        };

        let visualization;
        switch (newConfig) {
          case "mapping-only":
            visualization = createVisualizationFromModular(sampleMappingOnly, vizConfig);
            break;
          case "mapping-validate":
            visualization = createVisualizationFromModular(sampleMappingValidate, vizConfig);
            break;
          case "transform-validate":
            visualization = createVisualizationFromModular(sampleTransformValidate, vizConfig);
            break;
          case "integrated":
            visualization = createVisualizationFromIntegrated(sampleIntegrated, vizConfig);
            break;
          default:
            visualization = { nodes: [], edges: [] };
        }

        setNodes(visualization.nodes);
        setEdges(visualization.edges);
      }, 0);
    },
    [showParameters, compactMode, setNodes, setEdges]
  );

  // Fit view when nodes change
  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => {
        void fitView({ padding: 0.1, includeHiddenNodes: false });
      }, 100);
    }
  }, [nodes.length, fitView]);

  // Update visualization when display options change
  const updateVisualization = useCallback(() => {
    const { nodes: newNodes, edges: newEdges } = getCurrentVisualization();
    setNodes(newNodes);
    setEdges(newEdges);
  }, [getCurrentVisualization, setNodes, setEdges]);

  return (
    <div className="h-screen flex flex-col">
      {/* Control Panel */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Configuration:</label>
            <select
              value={selectedConfig}
              onChange={(e) => handleConfigChange(e.target.value as typeof selectedConfig)}
              className="border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="mapping-only">Mapping Only</option>
              <option value="mapping-validate">Mapping + Validation</option>
              <option value="transform-validate">Transform + Validate</option>
              <option value="integrated">Full Pipeline</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={showParameters}
                onChange={(e) => {
                  setShowParameters(e.target.checked);
                  setTimeout(updateVisualization, 0);
                }}
                className="rounded"
              />
              Show Parameters
            </label>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={compactMode}
                onChange={(e) => {
                  setCompactMode(e.target.checked);
                  setTimeout(updateVisualization, 0);
                }}
                className="rounded"
              />
              Compact Mode
            </label>
          </div>

          <div className="text-sm text-gray-500 ml-auto">
            {nodes.length} nodes, {edges.length} connections
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-slate-200 border border-slate-300 rounded"></div>
            <span>Group</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-200 border border-gray-400 rounded"></div>
            <span>Source File</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-200 border border-blue-400 rounded"></div>
            <span>Source Column</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-200 border border-yellow-400 rounded"></div>
            <span>Mapping</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-purple-200 border border-purple-400 rounded"></div>
            <span>Transform</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-pink-200 border border-pink-400 rounded"></div>
            <span>Validate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-200 border border-green-400 rounded"></div>
            <span>Output</span>
          </div>
        </div>
      </div>

      {/* Visualization */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2, includeHiddenNodes: false }}
          defaultEdgeOptions={{
            // animated: true,
            style: { stroke: "#6b7280", strokeWidth: 2 },
            type: "smoothstep",
          }}
          proOptions={{ hideAttribution: true }}
          className="bg-gray-50"
        >
          <Background />
          <Controls />
          {/* <MiniMap
            nodeStrokeColor="#374151"
            nodeColor="#f3f4f6"
            nodeBorderRadius={8}
            className="!bg-white !border-gray-300"
          /> */}
        </ReactFlow>
      </div>
    </div>
  );
}

function RouteComponent() {
  return (
    <ReactFlowProvider>
      <style>{`
        /* Override ReactFlow's default node styles to remove padding/margins */
        .react-flow__node {
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
        }

        .react-flow__node-default {
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          background: transparent !important;
        }

        .react-flow-node-override {
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
        }
      `}</style>
      <ConfigurationVisualizer />
    </ReactFlowProvider>
  );
}
