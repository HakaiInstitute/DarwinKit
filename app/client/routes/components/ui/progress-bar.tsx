import clsx from "clsx";
import { Icon } from "./icon";

export type StepStatus = "complete" | "current" | "upcoming";
export type StepResult = React.ReactNode | string | null;

export type Step = {
  name: string;
  description: string;
  status: StepStatus;
  result: StepResult;
};
export type Steps = readonly Step[];

const defaultSteps: Steps = [
  {
    name: "Upload CSV",
    description: "Add a file to get started.",
    status: "complete",
    result: (
      <p>
        <strong>2020_diver_species_list.csv</strong> (6 columns, 389 rows)
      </p>
    ),
  },
  {
    name: "Data Structure",
    description: "Choose the target format for your data.",
    status: "complete",
    result: (
      <p>
        <strong>Event Table</strong>
      </p>
    ),
  },
  {
    name: "Map Fields",
    description: "Map the source's fields to their targets.",
    status: "current",
    result: null,
  },
  {
    name: "Validate",
    description: "Ensure the data is correct and complete.",
    status: "upcoming",
    result: null,
  },
  {
    name: "Export",
    description: "Download the transformed data.",
    status: "upcoming",
    result: null,
  },
] as const;

export function ProgressBar({ steps = defaultSteps }: { steps: Steps }) {
  const completedSteps = steps.filter(
    (step) => step.status === "complete"
  ).length;
  const totalSteps = steps.length;
  const progressPercentage =
    totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <div>
      <h4 className="sr-only">Status</h4>
      <p className="text-sm font-medium text-gray-900 dark:text-white">
        {completedSteps} of {totalSteps} steps completed
      </p>
      <div aria-hidden="true" className="mt-6">
        <div className="overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            style={{ width: `${progressPercentage}%` }}
            className="h-2 rounded-full bg-indigo-600 dark:bg-indigo-500"
          />
        </div>
        <div
          className="mt-6 hidden text-sm font-medium text-gray-600 dark:text-gray-300 sm:grid"
          style={{
            gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))`,
          }}
        >
          {steps.map((step, index) => (
            <div key={step.name} className={clsx("relative flex gap-2 p-4")}>
              <div className="">
                {step.status === "complete" && (
                  <Icon
                    icon="check"
                    className="h-5 w-5 text-green-500 dark:text-green-400"
                  />
                )}
              </div>
              <div
                className={clsx("min-w-0", {
                  "text-green-700 dark:text-green-400":
                    step.status === "complete",
                })}
              >
                <p className="text-xs">
                  {index + 1}. {step.name}
                </p>
                {step.status == "complete" ? (
                  <span className="text-xs text-green-600 dark:text-green-400">
                    {step.result}
                  </span>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {step.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
