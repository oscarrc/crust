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
    <div className="max-w-md rounded-[10px] border border-dashed border-crumb px-5 py-4">
      <p className="m-0 mb-2 text-xs tracking-[0.08em] text-crumb uppercase">
        React island · <strong>{toasts.length}</strong> active toast
        {toasts.length === 1 ? "" : "s"}
      </p>
      <div className="flex flex-wrap gap-2">
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
        <button className="btn" onClick={() => toast.dismiss()}>
          Dismiss all
        </button>
      </div>
    </div>
  );
}
