import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { ShieldCheck } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
          <ShieldCheck className="h-6 w-6 text-[var(--brand)]" /> Privacy &amp;
          data governance
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          How this prototype treats location, physiological and
          reproductive-health-related data.
        </p>
      </div>

      <Card>
        <CardHeader title="Location data are sensitive" />
        <CardBody>
          <p className="text-sm leading-relaxed text-slate-600">
            GPS traces can reveal a rider&apos;s home, workplace, and daily
            movement patterns. In a real deployment, location data would
            require explicit consent, minimisation (retaining only what is
            needed for exposure estimation), and secure storage.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Physiological data are sensitive" />
        <CardBody>
          <p className="text-sm leading-relaxed text-slate-600">
            Heart rate, HRV, SpO₂ and sleep data are health-related signals.
            They are shown here only as contextual information and are never
            used to diagnose, predict, or infer any medical condition.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Reproductive-health-related information requires appropriate governance" />
        <CardBody>
          <p className="text-sm leading-relaxed text-slate-600">
            Because this research concept is motivated by male reproductive
            health, any future collection of reproductive-health-relevant
            exposure data would require dedicated ethics review, informed
            consent, and governance appropriate to sensitive health
            information — beyond the scope of this prototype.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="This prototype uses synthetic demonstration data" />
        <CardBody>
          <p className="text-sm leading-relaxed text-slate-600">
            All GPS, environmental and physiological data shown in this
            application are synthetically generated for research
            demonstration purposes. No real rider data is collected, stored,
            or transmitted by this prototype, other than optional live
            browser geolocation used only within your current session.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Not for clinical use" />
        <CardBody>
          <p className="text-sm leading-relaxed text-slate-600">
            ReproTwin is a research demonstrator. It is not a medical device,
            is not clinically validated, and must not be used for clinical
            diagnosis, treatment, or any individual health decision-making.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
