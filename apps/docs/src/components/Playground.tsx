import { toast } from "@oscarrc/crust/vanilla";
import { useToasts } from "@oscarrc/crust/react";

/**
 * The React side of the shared-store proof: triggers fired here land in
 * the exact same toaster the vanilla <script> buttons use, and the badge
 * counts toasts no matter which side baked them.
 */
export function Playground() {
  const toasts = useToasts();

  return (
    <div className="island">
      <p className="island-label">
        React island · <strong>{toasts.length}</strong> active toast
        {toasts.length === 1 ? "" : "s"}
      </p>
      <div className="island-buttons">
        <button
          className="btn"
          onClick={() =>
            toast.success("Triggered from inside a React island.", {
              title: "Island toast",
            })
          }
        >
          Toast from React
        </button>
        <button
          className="btn"
          onClick={() =>
            toast.info(
              "The badge above updates through useToasts() — same store, no context provider.",
              { title: "Shared store" },
            )
          }
        >
          Prove the shared store
        </button>
      </div>
    </div>
  );
}
