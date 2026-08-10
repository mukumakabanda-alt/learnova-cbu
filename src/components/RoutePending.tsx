import { motion } from "framer-motion";

// Shown by the router (see src/router.tsx) once a route transition has
// taken longer than defaultPendingMs — a slim bar at the very top of
// the screen, not a full-page takeover, since the previous page is
// still perfectly readable while the next one loads. This is the only
// signal a route change is happening at all on a slow connection; see
// the comment in router.tsx for why that matters here specifically.
export function RoutePending() {
  return (
    <div className="fixed inset-x-0 top-0 z-[200] h-0.5 overflow-hidden bg-primary/10">
      <motion.div
        className="h-full w-1/3 bg-gold-gradient"
        initial={{ x: "-100%" }}
        animate={{ x: "300%" }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
