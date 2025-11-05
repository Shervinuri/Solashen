
import React from 'react';

interface InfoWidgetProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export const InfoWidget: React.FC<InfoWidgetProps> = ({ icon, title, children, className }) => {
  return (
    <div className={`bg-gray-800/50 backdrop-blur-sm rounded-lg p-3 sm:p-4 border border-gray-700/50 shadow-lg h-full ${className || ''}`}>
      <div className="flex items-center mb-2">
        {icon}
        <h3 className="ml-2 text-sm font-bold text-gray-400">{title}</h3>
      </div>
      <div>
        {children}
      </div>
    </div>
  );
};
