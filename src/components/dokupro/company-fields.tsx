'use client';

import { Landmark, Settings, Building2, MapPin, Phone, Mail, CreditCard, Hash } from 'lucide-react';
import Link from 'next/link';
import type { CompanyInfo } from '@/lib/types';

interface CompanyFieldsProps {
  company: CompanyInfo;
  onChange: (company: CompanyInfo) => void;
}

export function CompanyFields({ company }: CompanyFieldsProps) {
  const hasData = company.nama || company.alamat || company.telepon || company.email;
  const hasBank = company.bankName || company.bankName2 || company.npwp;

  return (
    <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-slate-500" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Data Perusahaan
          </h3>
        </div>
        <Link
          href="/administrasi/pengaturan"
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
        >
          <Settings className="w-3 h-3" />
          Ubah di Pengaturan
        </Link>
      </div>

      {!hasData && !hasBank ? (
        <div className="text-center py-5">
          <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400 mb-2">Belum ada data perusahaan</p>
          <Link
            href="/administrasi/pengaturan"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Settings className="w-3 h-3" />
            Atur Sekarang
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Company Name */}
          {company.nama && (
            <div className="flex items-start gap-2">
              <Building2 className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm font-semibold text-slate-800">{company.nama}</p>
            </div>
          )}

          {/* Address */}
          {company.alamat && (
            <div className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-600 leading-relaxed">{company.alamat}</p>
            </div>
          )}

          {/* Phone & Email */}
          {(company.telepon || company.email) && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {company.telepon && (
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span className="text-xs text-slate-600">{company.telepon}</span>
                </div>
              )}
              {company.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3 h-3 text-slate-400" />
                  <span className="text-xs text-slate-600">{company.email}</span>
                </div>
              )}
            </div>
          )}

          {/* Bank Info */}
          {hasBank && (
            <div className="border-t border-slate-100 pt-2.5 mt-1 space-y-2">
              <div className="flex items-center gap-1.5">
                <Landmark className="w-3 h-3 text-teal-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Bank</span>
              </div>

              {company.bankName && (
                <div className="flex items-start gap-2 p-2 bg-teal-50/60 rounded-md">
                  <CreditCard className="w-3.5 h-3.5 text-teal-600 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-teal-700">{company.bankName}</p>
                    <div className="flex flex-wrap gap-x-2">
                      {company.bankAccount && <span className="text-[11px] text-slate-600">{company.bankAccount}</span>}
                      {company.bankHolder && <span className="text-[11px] text-slate-400">a.n. {company.bankHolder}</span>}
                    </div>
                  </div>
                </div>
              )}

              {company.bankName2 && (
                <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-md">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-600">{company.bankName2}</p>
                    <div className="flex flex-wrap gap-x-2">
                      {company.bankAccount2 && <span className="text-[11px] text-slate-600">{company.bankAccount2}</span>}
                      {company.bankHolder2 && <span className="text-[11px] text-slate-400">a.n. {company.bankHolder2}</span>}
                    </div>
                  </div>
                </div>
              )}

              {company.npwp && (
                <div className="flex items-center gap-2 p-2 bg-amber-50/60 rounded-md">
                  <Hash className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  <span className="text-[10px] font-semibold text-amber-700">NPWP</span>
                  <span className="text-[11px] text-slate-600">{company.npwp}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
