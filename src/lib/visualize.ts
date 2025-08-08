/**
 * Grouped Configuration Visualization Logic
 *
 * Uses ReactFlow grouping features to create step-based node organization
 */

import type { Edge, Node } from "@xyflow/react";
import type { IntegratedConfiguration } from "./configurator/integrated-configuration.js";
import type { ModularConfiguration } from "./configurator/modular-configuration.js";

// Node types including ReactFlow group type
export type ConfigNodeType =
  | "group" // Step group container
  | "subgroup" // Field-specific subgroup container
  | "source-file" // Input CSV file
  | "source-column" // Individual source column
  | "mapping" // Column mapping operation
  | "target-field" // Mapped Darwin Core field
  | "transformation" // Transformation step
  | "validation" // Validation step
  | "output"; // Final output

// Extended node data for configuration visualization
export interface ConfigNodeData extends Record<string, unknown> {
  id: string;
  label: string;
  type: ConfigNodeType;

  // Context information
  sourceFile?: string;
  columnName?: string;
  targetField?: string;
  functionName?: string;
  parameters?: Record<string, unknown>;

  // Styling hints
  status?: "active" | "inactive" | "error" | "warning";
  details?: string;

  // Edge connection information for handle visibility
  hasIncomingEdge?: boolean;
  hasOutgoingEdge?: boolean;
}

// Visualization configuration
export interface VisualizationConfig {
  layout: "horizontal" | "vertical";
  showParameters: boolean;
  highlightPath?: string;
  compactMode: boolean;
}

/**
 * Convert modular configuration to ReactFlow nodes and edges with proper grouping
 */
export function createVisualizationFromModular(
  config: ModularConfiguration,
  vizConfig: VisualizationConfig = {
    layout: "vertical",
    showParameters: false,
    compactMode: false,
  }
): { nodes: Node<ConfigNodeData>[]; edges: Edge[] } {
  const nodes: Node<ConfigNodeData>[] = [];
  const edges: Edge[] = [];

  let nodeId = 0;
  const getNextId = () => `node_${++nodeId}`;

  // Layout configuration - vertical groups, horizontal nodes within groups
  const groupWidth = 600; // Increased width to accommodate horizontal nodes
  const groupHeight = 120; // Height for single row of nodes
  const groupSpacing = 30;
  const nodeWidth = 140; // Width of individual nodes
  // const nodeHeight = 60; // Height of individual nodes
  const nodeSpacingX = 20; // Horizontal spacing between nodes
  // const nodeSpacing = 60; // For subgroup vertical spacing (legacy)
  const groupPadding = 15;

  // Analyze configuration to determine which groups are needed
  const neededGroups = new Set<string>();
  neededGroups.add("source"); // Always needed for source file and columns

  config.fields.forEach((field) => {
    switch (field.mode) {
      case "mapping-only":
      case "mapping-validate":
      case "mapping-transform":
      case "full-pipeline":
        neededGroups.add("mapping");
        break;
      case "transform-validate":
        // No mapping needed for transform-validate, just transforms and validations
        break;
    }

    // Check for transformations
    const hasTransforms =
      (field.mode === "transform-validate" ||
        field.mode === "mapping-transform" ||
        field.mode === "full-pipeline") &&
      "transformations" in field.config &&
      Array.isArray((field.config as { transformations: unknown[] }).transformations) &&
      (field.config as { transformations: unknown[] }).transformations.length > 0;
    if (hasTransforms) {
      neededGroups.add("transforms");
    }

    // Check for validations
    const hasValidations =
      (field.mode === "mapping-validate" ||
        field.mode === "transform-validate" ||
        field.mode === "full-pipeline") &&
      "validations" in field.config &&
      Array.isArray((field.config as { validations: unknown[] }).validations) &&
      (field.config as { validations: unknown[] }).validations.length > 0;
    if (hasValidations) {
      neededGroups.add("validations");
    }
  });

  // Create group IDs and positions only for needed groups
  const allGroupTypes = ["source", "mapping", "transforms", "validations"];
  const activeGroups = allGroupTypes.filter((type) => neededGroups.has(type));

  const groupIds: Record<string, string> = {};
  const groups: { id: string; label: string; type: string; y: number }[] = [];

  activeGroups.forEach((groupType, index) => {
    const groupId = getNextId();
    groupIds[groupType] = groupId;

    const labels = {
      source: `Source: ${config.sourceFile ?? "source_file.csv"}`,
      mapping: "Mapping",
      transforms: "Transforms",
      validations: "Validations",
    };

    groups.push({
      id: groupId,
      label: labels[groupType as keyof typeof labels],
      type: groupType,
      y: index * (groupHeight + groupSpacing),
    });
  });

  // Create group nodes
  groups.forEach((group) => {
    nodes.push({
      id: group.id,
      type: "group",
      position: { x: 0, y: group.y },
      data: {
        id: group.id,
        label: group.label,
        type: "group",
        status: "active",
      },
      className: "bg-slate-50/80 border-2 border-slate-200 rounded-lg",
      style: {
        width: groupWidth,
        height: groupHeight,
      },
    });
  });

  // Track node positions within groups (only for active groups)
  const groupNodeCounts: Record<string, number> = {};
  activeGroups.forEach((groupType) => {
    groupNodeCounts[groupType] = 0;
  });

  // Source columns will be root nodes in the source group (no separate source file node needed)

  // Collect and create source column nodes
  const sourceColumns = new Set<string>();
  config.fields.forEach((field) => {
    switch (field.mode) {
      case "mapping-only":
      case "mapping-validate":
      case "mapping-transform":
      case "full-pipeline": {
        const mappingConfig = field.config as { sourceColumn: string };
        sourceColumns.add(mappingConfig.sourceColumn);
        break;
      }
      case "transform-validate": {
        const tvConfig = field.config as { fieldName: string };
        sourceColumns.add(tvConfig.fieldName);
        break;
      }
    }
  });

  const sourceColumnNodes = new Map<string, string>();
  if (groupIds.source) {
    Array.from(sourceColumns).forEach((columnName, index) => {
      const sourceColId = getNextId();
      sourceColumnNodes.set(columnName, sourceColId);
      nodes.push({
        id: sourceColId,
        type: "default",
        position: {
          x: groupPadding + index * (nodeWidth + nodeSpacingX),
          y: 30, // Fixed y position for horizontal arrangement
        },
        parentId: groupIds.source,
        extent: "parent" as const,
        data: {
          id: sourceColId,
          label: columnName,
          type: "source-column",
          columnName: columnName,
          status: "active",
        },
      });

      // Source columns are root nodes (no connections to source file needed)
    });
  }

  // Process field configurations
  config.fields.forEach((field) => {
    switch (field.mode) {
      case "mapping-only": {
        const mappingConfig = field.config as {
          sourceColumn: string;
          targetField: string;
        };
        const sourceColId = sourceColumnNodes.get(mappingConfig.sourceColumn);

        if (groupIds.mapping) {
          const mappingId = getNextId();
          nodes.push({
            id: mappingId,
            type: "default",
            position: {
              x: groupPadding + groupNodeCounts.mapping * (nodeWidth + nodeSpacingX),
              y: 30, // Fixed y position for horizontal arrangement
            },
            parentId: groupIds.mapping,
            extent: "parent" as const,
            data: {
              id: mappingId,
              label: mappingConfig.targetField,
              type: "mapping",
              details: `${mappingConfig.sourceColumn} → ${mappingConfig.targetField}`,
              status: "active",
            },
          });
          groupNodeCounts.mapping++;

          if (sourceColId) {
            edges.push({
              id: `edge_${sourceColId}_${mappingId}`,
              source: sourceColId,
              target: mappingId,
              sourceHandle: null,
              targetHandle: null,
            });
          }
        }
        break;
      }

      case "mapping-validate": {
        const mvConfig = field.config as {
          sourceColumn: string;
          targetField: string;
          validations: {
            functionName: string;
            parameters: Record<string, unknown>;
          }[];
        };
        const sourceColId = sourceColumnNodes.get(mvConfig.sourceColumn);

        let mappingId: string | undefined;

        // Create mapping node (only if mapping group exists)
        if (groupIds.mapping) {
          mappingId = getNextId();
          nodes.push({
            id: mappingId,
            type: "default",
            position: {
              x: groupPadding + groupNodeCounts.mapping * (nodeWidth + nodeSpacingX),
              y: 30, // Fixed y position for horizontal arrangement
            },
            parentId: groupIds.mapping,
            extent: "parent" as const,
            data: {
              id: mappingId,
              label: mvConfig.targetField,
              type: "mapping",
              details: `${mvConfig.sourceColumn} → ${mvConfig.targetField}`,
              status: "active",
            },
          });
          groupNodeCounts.mapping++;

          if (sourceColId) {
            edges.push({
              id: `edge_${sourceColId}_${mappingId}`,
              source: sourceColId,
              target: mappingId,
              sourceHandle: null,
              targetHandle: null,
            });
          }
        }

        // Create validation subgroup and nodes (only if validations group exists)
        if (groupIds.validations && mvConfig.validations.length > 0) {
          const lastNodeId = mappingId ?? sourceColId;

          // Create subgroup for this field's validations
          const subgroupId = getNextId();
          const subgroupY = 20 + groupNodeCounts.validations * 80; // Reduced spacing between subgroups
          const subgroupWidth = Math.max(
            400,
            mvConfig.validations.length * (nodeWidth + nodeSpacingX) + 20
          );
          const subgroupHeight = 80; // Fixed height for horizontal layout

          nodes.push({
            id: subgroupId,
            type: "group",
            position: { x: groupPadding, y: subgroupY },
            parentId: groupIds.validations,
            extent: "parent" as const,
            data: {
              id: subgroupId,
              label: `${mvConfig.targetField} validations`,
              type: "subgroup",
              status: "active",
            },
            className: "bg-white/90 border border-gray-300 rounded-md",
            style: {
              width: subgroupWidth,
              height: subgroupHeight,
            },
          });

          // Create validation nodes within the subgroup - horizontally distributed
          mvConfig.validations.forEach((validation, index) => {
            const validationId = getNextId();
            nodes.push({
              id: validationId,
              type: "default",
              position: {
                x: 10 + index * (nodeWidth + nodeSpacingX),
                y: 10, // Fixed y position for horizontal arrangement
              },
              parentId: subgroupId,
              extent: "parent" as const,
              data: {
                id: validationId,
                label: validation.functionName,
                type: "validation",
                functionName: validation.functionName,
                parameters: vizConfig.showParameters ? validation.parameters : undefined,
                status: "active",
              },
            });

            if (index === 0 && lastNodeId) {
              // Connect the first validation to the previous node
              edges.push({
                id: `edge_${lastNodeId}_${validationId}`,
                source: lastNodeId,
                target: validationId,
                sourceHandle: null,
                targetHandle: null,
              });
            } else if (index > 0) {
              // Connect validations within the subgroup
              const prevValidationId = nodes[nodes.length - 2].id;
              edges.push({
                id: `edge_${prevValidationId}_${validationId}`,
                source: prevValidationId,
                target: validationId,
                sourceHandle: null,
                targetHandle: null,
              });
            }
          });

          // Update the group node count to account for the subgroup
          groupNodeCounts.validations++;
        }
        break;
      }

      case "transform-validate": {
        const tvConfig = field.config as {
          fieldName: string;
          transformations: {
            functionName: string;
            parameters: Record<string, unknown>;
          }[];
          validations: {
            functionName: string;
            parameters: Record<string, unknown>;
          }[];
        };
        const sourceColId = sourceColumnNodes.get(tvConfig.fieldName);
        let lastNodeId = sourceColId;

        // Create transformation nodes (only if transforms group exists)
        if (groupIds.transforms) {
          tvConfig.transformations.forEach((transform) => {
            const transformId = getNextId();
            nodes.push({
              id: transformId,
              type: "default",
              position: {
                x: groupPadding + groupNodeCounts.transforms * (nodeWidth + nodeSpacingX),
                y: 30, // Fixed y position for horizontal arrangement
              },
              parentId: groupIds.transforms,
              extent: "parent" as const,
              data: {
                id: transformId,
                label: transform.functionName,
                type: "transformation",
                functionName: transform.functionName,
                parameters: vizConfig.showParameters ? transform.parameters : undefined,
                status: "active",
              },
            });
            groupNodeCounts.transforms++;

            if (lastNodeId) {
              edges.push({
                id: `edge_${lastNodeId}_${transformId}`,
                source: lastNodeId,
                target: transformId,
                sourceHandle: null,
                targetHandle: null,
              });
            }
            lastNodeId = transformId;
          });
        }

        // Create validation subgroup and nodes (only if validations group exists)
        if (groupIds.validations && tvConfig.validations.length > 0) {
          // Create subgroup for this field's validations
          const subgroupId = getNextId();
          const subgroupY = 20 + groupNodeCounts.validations * 80; // Reduced spacing between subgroups
          const subgroupWidth = Math.max(
            400,
            tvConfig.validations.length * (nodeWidth + nodeSpacingX) + 20
          );
          const subgroupHeight = 80; // Fixed height for horizontal layout

          nodes.push({
            id: subgroupId,
            type: "group",
            position: { x: groupPadding, y: subgroupY },
            parentId: groupIds.validations,
            extent: "parent" as const,
            data: {
              id: subgroupId,
              label: `${tvConfig.fieldName} validations`,
              type: "subgroup",
              status: "active",
            },
            className: "bg-white/90 border border-gray-300 rounded-md",
            style: {
              width: subgroupWidth,
              height: subgroupHeight,
            },
          });

          // Create validation nodes within the subgroup - horizontally distributed
          tvConfig.validations.forEach((validation, index) => {
            const validationId = getNextId();
            nodes.push({
              id: validationId,
              type: "default",
              position: {
                x: 10 + index * (nodeWidth + nodeSpacingX),
                y: 10, // Fixed y position for horizontal arrangement
              },
              parentId: subgroupId,
              extent: "parent" as const,
              data: {
                id: validationId,
                label: validation.functionName,
                type: "validation",
                functionName: validation.functionName,
                parameters: vizConfig.showParameters ? validation.parameters : undefined,
                status: "active",
              },
            });

            if (index === 0 && lastNodeId) {
              // Connect the first validation to the previous node
              edges.push({
                id: `edge_${lastNodeId}_${validationId}`,
                source: lastNodeId,
                target: validationId,
                sourceHandle: null,
                targetHandle: null,
              });
            } else if (index > 0) {
              // Connect validations within the subgroup
              const prevValidationId = nodes[nodes.length - 2].id;
              edges.push({
                id: `edge_${prevValidationId}_${validationId}`,
                source: prevValidationId,
                target: validationId,
                sourceHandle: null,
                targetHandle: null,
              });
            }
          });

          // Update the group node count to account for the subgroup
          groupNodeCounts.validations++;
        }
        break;
      }

      case "mapping-transform": {
        const mtConfig = field.config as {
          sourceColumn: string;
          targetField: string;
          transformations: {
            functionName: string;
            parameters: Record<string, unknown>;
          }[];
        };
        const sourceColId = sourceColumnNodes.get(mtConfig.sourceColumn);

        let mappingId: string | undefined;

        // Create mapping node (only if mapping group exists)
        if (groupIds.mapping) {
          mappingId = getNextId();
          nodes.push({
            id: mappingId,
            type: "default",
            position: {
              x: groupPadding + groupNodeCounts.mapping * (nodeWidth + nodeSpacingX),
              y: 30, // Fixed y position for horizontal arrangement
            },
            parentId: groupIds.mapping,
            extent: "parent" as const,
            data: {
              id: mappingId,
              label: mtConfig.targetField,
              type: "mapping",
              details: `${mtConfig.sourceColumn} → ${mtConfig.targetField}`,
              status: "active",
            },
          });
          groupNodeCounts.mapping++;

          if (sourceColId) {
            edges.push({
              id: `edge_${sourceColId}_${mappingId}`,
              source: sourceColId,
              target: mappingId,
              sourceHandle: null,
              targetHandle: null,
            });
          }
        }

        // Create transformation nodes (only if transforms group exists)
        if (groupIds.transforms) {
          let lastNodeId = mappingId ?? sourceColId;
          mtConfig.transformations.forEach((transform) => {
            const transformId = getNextId();
            nodes.push({
              id: transformId,
              type: "default",
              position: {
                x: groupPadding + groupNodeCounts.transforms * (nodeWidth + nodeSpacingX),
                y: 30, // Fixed y position for horizontal arrangement
              },
              parentId: groupIds.transforms,
              extent: "parent" as const,
              data: {
                id: transformId,
                label: transform.functionName,
                type: "transformation",
                functionName: transform.functionName,
                parameters: vizConfig.showParameters ? transform.parameters : undefined,
                status: "active",
              },
            });
            groupNodeCounts.transforms++;

            if (lastNodeId) {
              edges.push({
                id: `edge_${lastNodeId}_${transformId}`,
                source: lastNodeId,
                target: transformId,
                sourceHandle: null,
                targetHandle: null,
              });
            }
            lastNodeId = transformId;
          });
        }
        break;
      }
    }
  });

  // Add edge information to node data for handle visibility
  const nodeConnections = new Map<string, { hasIncoming: boolean; hasOutgoing: boolean }>();

  // Initialize all nodes with no connections
  nodes.forEach((node) => {
    nodeConnections.set(node.id, { hasIncoming: false, hasOutgoing: false });
  });

  // Update connection status based on edges
  edges.forEach((edge) => {
    const sourceInfo = nodeConnections.get(edge.source);
    const targetInfo = nodeConnections.get(edge.target);

    if (sourceInfo) sourceInfo.hasOutgoing = true;
    if (targetInfo) targetInfo.hasIncoming = true;
  });

  // Update node data with connection information
  nodes.forEach((node) => {
    const connections = nodeConnections.get(node.id);
    if (connections) {
      node.data.hasIncomingEdge = connections.hasIncoming;
      node.data.hasOutgoingEdge = connections.hasOutgoing;
    }
  });

  return { nodes, edges };
}

/**
 * Convert integrated configuration to ReactFlow nodes and edges with proper grouping
 */
export function createVisualizationFromIntegrated(
  config: IntegratedConfiguration,
  vizConfig: VisualizationConfig = {
    layout: "vertical",
    showParameters: false,
    compactMode: false,
  }
): { nodes: Node<ConfigNodeData>[]; edges: Edge[] } {
  const nodes: Node<ConfigNodeData>[] = [];
  const edges: Edge[] = [];

  let nodeId = 0;
  const getNextId = () => `node_${++nodeId}`;

  // Layout configuration - vertical groups, horizontal nodes within groups
  const groupWidth = 600; // Increased width to accommodate horizontal nodes
  const groupHeight = 120; // Height for single row of nodes
  const groupSpacing = 30;
  const nodeWidth = 140; // Width of individual nodes
  // const nodeHeight = 60; // Height of individual nodes
  const nodeSpacingX = 20; // Horizontal spacing between nodes
  // const nodeSpacing = 60; // For subgroup vertical spacing (legacy)
  const groupPadding = 15;

  // Analyze integrated configuration to determine which groups are needed
  const neededGroups = new Set<string>();
  neededGroups.add("source"); // Always needed for source file and columns

  config.fieldMappings.forEach((fieldMapping) => {
    // All integrated mappings include mapping step (sourceColumn → targetField)
    if (fieldMapping.sourceColumn !== fieldMapping.targetField) {
      neededGroups.add("mapping");
    }

    // Check for transformations
    if (fieldMapping.transformations && fieldMapping.transformations.length > 0) {
      neededGroups.add("transforms");
    }

    // Check for validations
    if (fieldMapping.validations && fieldMapping.validations.length > 0) {
      neededGroups.add("validations");
    }
  });

  // Create group IDs and positions only for needed groups
  const allGroupTypes = ["source", "mapping", "transforms", "validations"];
  const activeGroups = allGroupTypes.filter((type) => neededGroups.has(type));

  const groupIds: Record<string, string> = {};
  const groups: { id: string; label: string; type: string; y: number }[] = [];

  activeGroups.forEach((groupType, index) => {
    const groupId = getNextId();
    groupIds[groupType] = groupId;

    const labels = {
      source: `Source: ${config.sourceFile || "source_file.csv"}`,
      mapping: "Mapping",
      transforms: "Transforms",
      validations: "Validations",
    };

    groups.push({
      id: groupId,
      label: labels[groupType as keyof typeof labels],
      type: groupType,
      y: index * (groupHeight + groupSpacing),
    });
  });

  // Create group nodes
  groups.forEach((group) => {
    nodes.push({
      id: group.id,
      type: "group",
      position: { x: 0, y: group.y },
      data: {
        id: group.id,
        label: group.label,
        type: "group",
        status: "active",
      },
      className: "bg-slate-50/80 border-2 border-slate-200 rounded-lg",
      style: {
        width: groupWidth,
        height: groupHeight,
      },
    });
  });

  // Track node positions within groups
  const groupNodeCounts: Record<string, number> = {};
  activeGroups.forEach((groupType) => {
    groupNodeCounts[groupType] = 0;
  });

  // Source columns will be root nodes in the source group (no separate source file node needed)

  // Collect and create source column nodes
  const sourceColumns = new Set<string>();
  config.fieldMappings.forEach((fieldMapping) => {
    sourceColumns.add(fieldMapping.sourceColumn);
  });

  const sourceColumnNodes = new Map<string, string>();
  if (groupIds.source) {
    Array.from(sourceColumns).forEach((columnName, index) => {
      const sourceColId = getNextId();
      sourceColumnNodes.set(columnName, sourceColId);
      nodes.push({
        id: sourceColId,
        type: "default",
        position: {
          x: groupPadding + index * (nodeWidth + nodeSpacingX),
          y: 30, // Fixed y position for horizontal arrangement
        },
        parentId: groupIds.source,
        extent: "parent" as const,
        data: {
          id: sourceColId,
          label: columnName,
          type: "source-column",
          columnName: columnName,
          status: "active",
        },
      });

      // Source columns are root nodes (no connections to source file needed)
    });
  }

  // Process each field mapping
  config.fieldMappings.forEach((fieldMapping) => {
    const sourceColId = sourceColumnNodes.get(fieldMapping.sourceColumn);
    let lastNodeId = sourceColId;

    // Create mapping node (if source != target and mapping group exists)
    let mappingId: string | undefined;
    if (fieldMapping.sourceColumn !== fieldMapping.targetField && groupIds.mapping) {
      mappingId = getNextId();
      nodes.push({
        id: mappingId,
        type: "default",
        position: {
          x: groupPadding + groupNodeCounts.mapping * (nodeWidth + nodeSpacingX),
          y: 30, // Fixed y position for horizontal arrangement
        },
        parentId: groupIds.mapping,
        extent: "parent" as const,
        data: {
          id: mappingId,
          label: fieldMapping.targetField,
          type: "mapping",
          details: `${fieldMapping.sourceColumn} → ${fieldMapping.targetField}`,
          status: "active",
        },
      });
      groupNodeCounts.mapping++;

      if (sourceColId) {
        edges.push({
          id: `edge_${sourceColId}_${mappingId}`,
          source: sourceColId,
          target: mappingId,
          sourceHandle: null,
          targetHandle: null,
        });
      }
      lastNodeId = mappingId;
    }

    // Create transformation nodes
    if (fieldMapping.transformations && groupIds.transforms) {
      fieldMapping.transformations.forEach((transform) => {
        const transformId = getNextId();
        nodes.push({
          id: transformId,
          type: "default",
          position: {
            x: groupPadding + groupNodeCounts.transforms * (nodeWidth + nodeSpacingX),
            y: 30, // Fixed y position for horizontal arrangement
          },
          parentId: groupIds.transforms,
          extent: "parent" as const,
          data: {
            id: transformId,
            label: transform.functionName,
            type: "transformation",
            functionName: transform.functionName,
            parameters: vizConfig.showParameters ? transform.parameters : undefined,
            status: "active",
          },
        });
        groupNodeCounts.transforms++;

        if (lastNodeId) {
          edges.push({
            id: `edge_${lastNodeId}_${transformId}`,
            source: lastNodeId,
            target: transformId,
            sourceHandle: null,
            targetHandle: null,
          });
        }
        lastNodeId = transformId;
      });
    }

    // Create validation subgroup and nodes
    if (fieldMapping.validations && groupIds.validations && fieldMapping.validations.length > 0) {
      // Create subgroup for this field's validations
      const subgroupId = getNextId();
      const subgroupY = 20 + groupNodeCounts.validations * 80; // Reduced spacing between subgroups
      const subgroupWidth = Math.max(
        400,
        fieldMapping.validations.length * (nodeWidth + nodeSpacingX) + 20
      );
      const subgroupHeight = 80; // Fixed height for horizontal layout

      nodes.push({
        id: subgroupId,
        type: "group",
        position: { x: groupPadding, y: subgroupY },
        parentId: groupIds.validations,
        extent: "parent" as const,
        data: {
          id: subgroupId,
          label: `${fieldMapping.targetField} validations`,
          type: "subgroup",
          status: "active",
        },
        className: "bg-white/90 border border-gray-300 rounded-md",
        style: {
          width: subgroupWidth,
          height: subgroupHeight,
        },
      });

      // Create validation nodes within the subgroup - horizontally distributed
      fieldMapping.validations.forEach((validation, index) => {
        const validationId = getNextId();
        nodes.push({
          id: validationId,
          type: "default",
          position: {
            x: 10 + index * (nodeWidth + nodeSpacingX),
            y: 10, // Fixed y position for horizontal arrangement
          },
          parentId: subgroupId,
          extent: "parent" as const,
          data: {
            id: validationId,
            label: validation.functionName,
            type: "validation",
            functionName: validation.functionName,
            parameters: vizConfig.showParameters ? validation.parameters : undefined,
            status: "active",
          },
        });

        if (index === 0 && lastNodeId) {
          // Connect the first validation to the previous node
          edges.push({
            id: `edge_${lastNodeId}_${validationId}`,
            source: lastNodeId,
            target: validationId,
            sourceHandle: null,
            targetHandle: null,
          });
        } else if (index > 0) {
          // Connect validations within the subgroup
          const prevValidationId = nodes[nodes.length - 2].id;
          edges.push({
            id: `edge_${prevValidationId}_${validationId}`,
            source: prevValidationId,
            target: validationId,
            sourceHandle: null,
            targetHandle: null,
          });
        }
      });

      // Update the group node count to account for the subgroup
      groupNodeCounts.validations++;
    }
  });

  // Add edge information to node data for handle visibility
  const nodeConnections = new Map<string, { hasIncoming: boolean; hasOutgoing: boolean }>();

  // Initialize all nodes with no connections
  nodes.forEach((node) => {
    nodeConnections.set(node.id, { hasIncoming: false, hasOutgoing: false });
  });

  // Update connection status based on edges
  edges.forEach((edge) => {
    const sourceInfo = nodeConnections.get(edge.source);
    const targetInfo = nodeConnections.get(edge.target);

    if (sourceInfo) sourceInfo.hasOutgoing = true;
    if (targetInfo) targetInfo.hasIncoming = true;
  });

  // Update node data with connection information
  nodes.forEach((node) => {
    const connections = nodeConnections.get(node.id);
    if (connections) {
      node.data.hasIncomingEdge = connections.hasIncoming;
      node.data.hasOutgoingEdge = connections.hasOutgoing;
    }
  });

  return { nodes, edges };
}

/**
 * Get node styles and className based on type and status
 */
export function getNodeStyle(nodeType: ConfigNodeType) {
  const baseClasses =
    "w-full h-full rounded-lg text-xs font-medium text-center flex items-center justify-center";

  const typeClasses = {
    group: "bg-transparent text-gray-800 font-semibold",
    subgroup: "bg-white/90 text-gray-600 font-medium",
    "source-file": "bg-gray-100 text-gray-600",
    "source-column": "bg-blue-100 text-blue-800",
    mapping: "bg-amber-100 text-amber-800",
    "target-field": "bg-emerald-100 text-emerald-800",
    transformation: "bg-violet-100 text-violet-800",
    validation: "bg-pink-100 text-pink-800",
    output: "bg-emerald-100 text-emerald-800",
  };

  return {
    className: `${baseClasses} ${typeClasses[nodeType]}`,
    // Keep minimal inline styles only for properties not easily handled by Tailwind
    style: {},
  };
}
