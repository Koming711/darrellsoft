'use client';

interface CompanyInfo {
  nama: string;
  alamat: string;
  telepon: string;
  email: string;
  logo?: string;
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
  bankName2?: string;
  bankAccount2?: string;
  bankHolder2?: string;
}

interface DocumentHeaderProps {
  company: CompanyInfo;
  docTitle: React.ReactNode;
}

export function DocumentHeader({ company, docTitle }: DocumentHeaderProps) {
  const companyInitial = (company.nama || 'C').charAt(0).toUpperCase();

  return (
    <div className="flex items-start justify-between mb-4 print:mb-[1.5mm]">
      <div className="flex items-start gap-3">
        <div
          className="print-logo-box flex h-12 w-12 shrink-0 items-center justify-center rounded font-bold text-lg print:h-9 print:w-9 print:text-[14px]"
          style={{ backgroundColor: company.logo ? 'transparent' : '#000000' }}
        >
          {company.logo ? (
            <img src={company.logo} alt="Logo" className="h-full w-full object-contain" />
          ) : (
            <span className="text-white">{companyInitial}</span>
          )}
        </div>
        <div className="company-info">
          <p className="company-name text-[17px] font-bold print:text-[17px] text-black">
            {company.nama || ''}
          </p>
          {company.alamat && (
            <p className="text-[12px] print:text-[12px] text-neutral-600">{company.alamat}</p>
          )}
          {(company.telepon || company.email) && (
            <div className="flex gap-4 text-[12px] print:text-[12px] text-neutral-600">
              {company.telepon && <span>{company.telepon}</span>}
              {company.email && <span>{company.email}</span>}
            </div>
          )}
          {(company.bankName || company.bankName2) && (
            <div className="text-[10px] print:text-[9px] text-neutral-600 mt-0.5">
              {company.bankName && (
                <span>{company.bankName} {company.bankAccount} a.n. {company.bankHolder}</span>
              )}
              {company.bankName2 && (
                <span className="ml-3">{company.bankName2} {company.bankAccount2} a.n. {company.bankHolder2}</span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="text-right">{docTitle}</div>
    </div>
  );
}
