import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileSpreadsheet, Clock, Zap, RefreshCw, Database } from 'lucide-react';
import Image from 'next/image';

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

interface WorkflowStepProps {
  number: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <section className="container mx-auto px-4 pt-8 pb-16 text-center">
        {/* Logo */}
        <div className="flex justify-center mb-12">
          <Image
            src="/lovable-uploads/web_logo.png"
            alt="Tallyze"
            width={180}
            height={60}
            className="h-auto"
            priority
          />
        </div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl md:text-6xl font-bold text-gray-900 mb-6"
        >
          Automate Your Financial <br />
          Analysis & Workflows <br />
          <span className="text-[#3cbd84]">with AI</span>
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto"
        >
          Transform your Excel workflows into automated processes. Connect with Xero, 
          Salesforce, and more to streamline your financial analysis and reporting.
        </motion.p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Button size="lg" className="bg-[#3cbd84] hover:bg-[#2da46f]">
            Try Tallyze Free <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline" className="border-[#3cbd84] text-[#3cbd84] hover:bg-[#3cbd84]/10">
            See how it works
          </Button>
        </div>

        <div className="text-sm text-gray-500 mb-8">
          Trusted by finance teams at Fortune 500 companies and leading enterprises
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard 
            icon={<FileSpreadsheet className="h-8 w-8 text-[#3cbd84]" />}
            title="Smart Excel Analysis"
            description="AI-powered analysis of your financial spreadsheets. Get insights, anomaly detection, and automated reporting."
          />
          <FeatureCard 
            icon={<Clock className="h-8 w-8 text-[#3cbd84]" />}
            title="Scheduled Workflows"
            description="Set up automated workflows that run on your schedule. Daily reconciliation, weekly reports, monthly closings."
          />
          <FeatureCard 
            icon={<Zap className="h-8 w-8 text-[#3cbd84]" />}
            title="Real-time Integration"
            description="Connect directly with Xero, Salesforce, and other financial tools for live data analysis."
          />
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-16 bg-gray-50">
        <h2 className="text-3xl font-bold text-center mb-12">How Tallyze Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <WorkflowStep 
            number="1"
            title="Connect Your Data"
            description="Import your Excel files or connect directly to Xero, Salesforce, and other platforms."
            icon={<Database className="h-6 w-6" />}
          />
          <WorkflowStep 
            number="2"
            title="Set Up Workflows"
            description="Create automated workflows for your financial processes with our visual builder."
            icon={<RefreshCw className="h-6 w-6" />}
          />
          <WorkflowStep 
            number="3"
            title="Automate & Monitor"
            description="Let AI handle your routine tasks while you monitor results and get alerts."
            icon={<Zap className="h-6 w-6" />}
          />
        </div>
      </section>

      {/* Integration Partners */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Integrations</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center justify-items-center">
          {/* Add integration partner logos here */}
          <div className="h-12 w-32 bg-gray-200 rounded flex items-center justify-center">Xero</div>
          <div className="h-12 w-32 bg-gray-200 rounded flex items-center justify-center">Salesforce</div>
          <div className="h-12 w-32 bg-gray-200 rounded flex items-center justify-center">Excel</div>
          <div className="h-12 w-32 bg-gray-200 rounded flex items-center justify-center">Google Sheets</div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl font-bold mb-6">
          Ready to Transform Your Financial Workflows?
        </h2>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Join leading companies that have automated their financial operations with Tallyze.
        </p>
        <Button size="lg" className="bg-[#3cbd84] hover:bg-[#2da46f]">
          Start Your Free Trial <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </section>
    </div>
  );
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description }) => {
  return (
    <div className="p-6 rounded-lg border border-gray-200 hover:shadow-lg transition-shadow">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

const WorkflowStep: React.FC<WorkflowStepProps> = ({ number, title, description, icon }) => {
  return (
    <div className="text-center">
      <div className="w-12 h-12 rounded-full bg-[#3cbd84]/10 text-[#3cbd84] flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <div className="text-xl font-semibold mb-2">{title}</div>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}
