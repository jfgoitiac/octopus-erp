export const TablaScroll = ({ children, className = '' }) => (
  <div className={`w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 ${className}`}>
    {children}
  </div>
);
