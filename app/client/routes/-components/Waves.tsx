const Wave = ({ className }: { className?: string }) => (
  <div
    className={`absolute top-[60%] -left-[50%] w-[200%] h-[200%] rounded-[35%] bg-gradient-to-b from-teal-600 to-teal-300 opacity-50 ${className}`}
  ></div>
);

export const Waves = ({ className }: { className?: string }) => (
  <div className={`relative group overflow-hidden rounded-full ${className}`}>
    <Wave className="animate-[spin_6s_ease-in-out_infinite]" />
    <Wave className="animate-[spin_9s_ease-in-out_infinite]" />
    <Wave className="animate-[spin_11s_ease-in-out_infinite]" />
  </div>
);

export const SineWave = ({ className }: { className?: string }) => (
  <svg viewBox="5 0 80 80" className={className}>
    <path
      className="wave"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.5rem"
      strokeLinecap="round"
      d="M 0 50 c 7.684299348848887 0 7.172012725592294 -15 15 -15 s 7.172012725592294 15 15 15 s 7.172012725592294 -15 15 -15 s 7.172012725592294 15 15 15 s 7.172012725592294 -15 15 -15 s 7.172012725592294 15 15 15 s 7.172012725592294 -15 15 -15 s 7.172012725592294 15 15 15 s 7.172012725592294 -15 15 -15 s 7.172012725592294 15 15 15 s 7.172012725592294 -15 15 -15 s 7.172012725592294 15 15 15 s 7.172012725592294 -15 15 -15 s 7.172012725592294 15 15 15 s 7.172012725592294 -15 15 -15"
    />
  </svg>
);
